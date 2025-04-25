import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useMemo,
  useRef,
  useState,
} from '../../../lib/teact/teact';
import { getActions, getGlobal, setGlobal, withGlobal } from '../../../global';

import type { ApiChat, ApiSticker, ApiStickerSet } from '../../../api/types';
import type { StickerSetOrReactionsSetOrRecent, ThreadId } from '../../../types';

import {
  CHAT_STICKER_SET_ID,
  EFFECT_EMOJIS_SET_ID,
  EFFECT_STICKERS_SET_ID,
  FAVORITE_SYMBOL_SET_ID,
  RECENT_SYMBOL_SET_ID,
  SLIDE_TRANSITION_DURATION,
  STICKER_PICKER_MAX_SHARED_COVERS,
  STICKER_SIZE_PICKER_HEADER,
} from '../../../config';
import { isUserId } from '../../../global/helpers';
import {
  selectChat, selectChatFullInfo, selectIsChatWithSelf, selectIsCurrentUserPremium, selectShouldLoopStickers,
  selectTabState,
} from '../../../global/selectors';
import animateHorizontalScroll from '../../../util/animateHorizontalScroll';
import buildClassName from '../../../util/buildClassName';
import { pickTruthy } from '../../../util/iteratees';
import { MEMO_EMPTY_ARRAY } from '../../../util/memo';
import { IS_TOUCH_ENV } from '../../../util/windowEnvironment';
import { REM } from '../../common/helpers/mediaDimensions';

import useHorizontalScroll from '../../../hooks/useHorizontalScroll';
import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';
import useScrolledState from '../../../hooks/useScrolledState';
import useSendMessageAction from '../../../hooks/useSendMessageAction';
import { useStickerPickerObservers } from '../../common/hooks/useStickerPickerObservers';
import useAsyncRendering from '../../right/hooks/useAsyncRendering';

import Avatar from '../../common/Avatar';
import Icon from '../../common/icons/Icon';
import StickerButton from '../../common/StickerButton';
import StickerSet from '../../common/StickerSet';
import Button from '../../ui/Button';
import Loading from '../../ui/Loading';
import StickerSetCover from './StickerSetCover';

import styles from './StickerPicker.module.scss';
import './StickerPicker.scss';
import SearchInput from '../../ui/SearchInput';
import { ensureEmojiData } from './EmojiPicker';
import StickerSetResult from '../../right/StickerSetResult';
import { debounce } from '../../../util/schedulers';
import { callApi } from '../../../api/gramjs';
import searchWords from '../../../util/searchWords';
import { updateStickerSets } from '../../../global/reducers';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
const EMOJI_CATEGORIES = {
  heart: '❤️',
  like: '👍',
  dislike: '👎',
  party: '🎉',
  haha: '😀',
  omg: '😧',
  sad: '☹️',
  angry: '😠',
  neutral: '😐',
  what: '🤔',
  tongue: '😝',
};
const searchThrottled = debounce((cb) => cb(), 500, false); // No idea why throttle was used here
const INTERSECTION_THROTTLE = 200;

type OwnProps = {
  chatId: string;
  threadId?: ThreadId;
  className: string;
  isHidden?: boolean;
  isTranslucent?: boolean;
  loadAndPlay: boolean;
  canSendStickers?: boolean;
  noContextMenus?: boolean;
  idPrefix: string;
  isSearchFocused?: boolean;
  onSearchFocused?: (focused: boolean) => void;
  onStickerSelect: (
    sticker: ApiSticker, isSilent?: boolean, shouldSchedule?: boolean, canUpdateStickerSetsOrder?: boolean,
  ) => void;
  isForEffects?: boolean;
};

type StateProps = {
  chat?: ApiChat;
  recentStickers: ApiSticker[];
  favoriteStickers: ApiSticker[];
  effectStickers?: ApiSticker[];
  effectEmojis?: ApiSticker[];
  stickerSetsById: Record<string, ApiStickerSet>;
  chatStickerSetId?: string;
  addedSetIds?: string[];
  featuredIds?: string[];
  canAnimate?: boolean;
  isSavedMessages?: boolean;
  isCurrentUserPremium?: boolean;
  isModalOpen: boolean;
};

const HEADER_BUTTON_WIDTH = 2.5 * REM; // px (including margin)

let featuredLoaded = false;

const StickerPicker: FC<OwnProps & StateProps> = ({
  chat,
  threadId,
  className,
  isHidden,
  isTranslucent,
  loadAndPlay,
  canSendStickers,
  recentStickers,
  favoriteStickers,
  effectStickers,
  effectEmojis,
  addedSetIds,
  featuredIds,
  stickerSetsById,
  chatStickerSetId,
  canAnimate,
  isSavedMessages,
  isCurrentUserPremium,
  noContextMenus,
  idPrefix,
  onStickerSelect,
  isForEffects,
  isModalOpen,
  isSearchFocused,
  onSearchFocused,
}) => {
  const {
    loadRecentStickers,
    addRecentSticker,
    unfaveSticker,
    faveSticker,
    removeRecentSticker,
    loadFeaturedStickers,
  } = getActions();

  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const headerRef = useRef<HTMLDivElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const sharedCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [emojis, setEmojis] = useState<AllEmojis>();
  const [searchFilter, setSearchFilter] = useState('');
  const [emojiCategoryFilter, setEmojiCategoryFilter] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);

  const matchingEmojis = useMemo(() => {
    if (!emojis || (!searchFilter && !emojiCategoryFilter)) {
      return undefined;
    }
    const native = EMOJI_CATEGORIES[emojiCategoryFilter as keyof typeof EMOJI_CATEGORIES];
    const all: Record<string, boolean> = {};
    if (native) {
      all[native] = true;
    }
    if (searchFilter) {
      const filter = searchFilter.toLocaleLowerCase();
      for (const emoji of Object.values(emojis)) {
        if ('names' in emoji) {
          if ((emoji as Emoji).native && emoji.names.some((name) => name.includes(filter))) {
            all[emoji.native] = true;
          }
          continue;
        }
        if (Object.values(emoji).some((emoji) => emoji.names.some((name: string) => name.includes(filter)))) {
          for (const e of Object.values(emoji)) {
            if (e.native) {
              all[e.native] = true;
            }
          }
        }
      }
    }
    return all;
  }, [emojis, searchFilter, emojiCategoryFilter]);
  useEffect(() => {
    setTimeout(async () => {
      const emojiData = await ensureEmojiData();
      setEmojis(emojiData.emojis as AllEmojis);
    }, 200);
  }, []);

  async function searchStickers(query: string) {
    if (!query) {
      return;
    }
    void searchThrottled(async () => {
      const result = await callApi('searchStickers', { query });
      if (!result) {
        return;
      }

      let global = getGlobal();
      const { setsById, added } = global.stickers;

      const resultIds = result.sets.map(({ id }) => id);

      if (added.setIds) {
        added.setIds.forEach((id) => {
          if (!resultIds.includes(id)) {
            const { title } = setsById[id] || {};
            if (title && searchWords(title, query)) {
              resultIds.unshift(id);
            }
          }
        });
      }

      global = updateStickerSets(
        global,
        'search',
        result.hash,
        result.sets,
      );

      setGlobal(global);
      setSearchResults(resultIds);
    });
  }

  if (!featuredLoaded) {
    featuredLoaded = true;
    loadFeaturedStickers();
  }

  const {
    handleScroll: handleContentScroll,
    isAtBeginning: shouldHideTopBorder,
  } = useScrolledState();

  const sendMessageAction = useSendMessageAction(chat?.id, threadId);

  const prefix = `${idPrefix}-sticker-set`;
  const {
    activeSetIndex,
    observeIntersectionForSet,
    observeIntersectionForPlayingItems,
    observeIntersectionForShowingItems,
    observeIntersectionForCovers,
    selectStickerSet,
  } = useStickerPickerObservers(containerRef, headerRef, prefix, isHidden);
  
  const {
    observe: observeIntersection,
  } = useIntersectionObserver({ rootRef: searchResultsRef, throttleMs: INTERSECTION_THROTTLE });

  const lang = useOldLang();

  const areAddedLoaded = Boolean(addedSetIds);

  const allSets = useMemo(() => {
    if (isForEffects && effectStickers) {
      const effectSets: StickerSetOrReactionsSetOrRecent[] = [];
      if (effectEmojis?.length) {
        effectSets.push({
          id: EFFECT_EMOJIS_SET_ID,
          accessHash: '0',
          title: '',
          stickers: effectEmojis,
          count: effectEmojis.length,
          isEmoji: true,
        });
      }
      if (effectStickers?.length) {
        effectSets.push({
          id: EFFECT_STICKERS_SET_ID,
          accessHash: '0',
          title: lang('StickerEffects'),
          stickers: effectStickers,
          count: effectStickers.length,
        });
      }
      return effectSets;
    }

    if (!addedSetIds) {
      return MEMO_EMPTY_ARRAY;
    }

    const defaultSets = [];

    if (favoriteStickers.length) {
      defaultSets.push({
        id: FAVORITE_SYMBOL_SET_ID,
        accessHash: '0',
        title: lang('FavoriteStickers'),
        stickers: favoriteStickers,
        count: favoriteStickers.length,
      });
    }

    if (recentStickers.length) {
      defaultSets.push({
        id: RECENT_SYMBOL_SET_ID,
        accessHash: '0',
        title: lang('RecentStickers'),
        stickers: recentStickers,
        count: recentStickers.length,
      });
    }

    const userSetIds = [...(addedSetIds || [])];
    if (chatStickerSetId) {
      userSetIds.unshift(chatStickerSetId);
    }

    const existingAddedSetIds = Object.values(pickTruthy(stickerSetsById, userSetIds));

    return [
      ...defaultSets,
      ...existingAddedSetIds,
    ];
  }, [
    addedSetIds,
    stickerSetsById,
    favoriteStickers,
    recentStickers,
    chatStickerSetId,
    lang,
    effectStickers,
    isForEffects,
    effectEmojis,
    emojiCategoryFilter,
    searchFilter,
    matchingEmojis,
  ]);
  const filteredSets = useMemo(() => {
    if (!matchingEmojis) {
      return allSets;
    }
    return allSets.filter((set) => set.stickers?.some((sticker) => matchingEmojis?.[sticker.emoji as string]));
  }, [allSets, matchingEmojis]);

  const noPopulatedSets = useMemo(() => (
    areAddedLoaded
    && allSets.filter((set) => set.stickers?.length).length === 0
  ), [allSets, areAddedLoaded]);

  useEffect(() => {
    if (!loadAndPlay) return;
    loadRecentStickers();
    if (!canSendStickers) return;
    sendMessageAction({ type: 'chooseSticker' });
  }, [canSendStickers, loadAndPlay, loadRecentStickers, sendMessageAction]);

  const canRenderContents = useAsyncRendering([], SLIDE_TRANSITION_DURATION);
  const shouldRenderContents = areAddedLoaded && canRenderContents
  && /*!noPopulatedSets &&*/ (canSendStickers || isForEffects);

  useHorizontalScroll(headerRef, !shouldRenderContents || !headerRef.current);

  // Scroll container and header when active set changes
  useEffect(() => {
    if (!areAddedLoaded) {
      return;
    }

    const header = headerRef.current;
    if (!header) {
      return;
    }

    const newLeft = activeSetIndex * HEADER_BUTTON_WIDTH - (header.offsetWidth / 2 - HEADER_BUTTON_WIDTH / 2);

    animateHorizontalScroll(header, newLeft);
  }, [areAddedLoaded, activeSetIndex]);
  
  useEffect(() => {
    if (isSearchFocused && containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isSearchFocused]);

  useEffect(() => {
    if (!shouldHideTopBorder) {
      onSearchFocused?.(false);
    }
  }, [shouldHideTopBorder, onSearchFocused]);

  const handleStickerSelect = useLastCallback((sticker: ApiSticker, isSilent?: boolean, shouldSchedule?: boolean) => {
    onStickerSelect(sticker, isSilent, shouldSchedule, true);
    addRecentSticker({ sticker });
  });

  const handleStickerUnfave = useLastCallback((sticker: ApiSticker) => {
    unfaveSticker({ sticker });
  });

  const handleStickerFave = useLastCallback((sticker: ApiSticker) => {
    faveSticker({ sticker });
  });

  const handleMouseMove = useLastCallback(() => {
    if (!canSendStickers) return;
    sendMessageAction({ type: 'chooseSticker' });
  });

  const handleRemoveRecentSticker = useLastCallback((sticker: ApiSticker) => {
    removeRecentSticker({ sticker });
  });

  if (!chat) return undefined;

  function renderCover(stickerSet: StickerSetOrReactionsSetOrRecent, index: number) {
    const firstSticker = stickerSet.stickers?.[0];
    const buttonClassName = buildClassName(styles.stickerCover, index === activeSetIndex && styles.activated);
    const withSharedCanvas = index < STICKER_PICKER_MAX_SHARED_COVERS;

    if (stickerSet.id === RECENT_SYMBOL_SET_ID
      || stickerSet.id === FAVORITE_SYMBOL_SET_ID
      || stickerSet.id === CHAT_STICKER_SET_ID
      || stickerSet.hasThumbnail
      || !firstSticker
    ) {
      return (
        <Button
          key={stickerSet.id}
          className={buttonClassName}
          ariaLabel={stickerSet.title}
          round
          faded={stickerSet.id === RECENT_SYMBOL_SET_ID || stickerSet.id === FAVORITE_SYMBOL_SET_ID}
          color="translucent"
          // eslint-disable-next-line react/jsx-no-bind
          onClick={() => selectStickerSet(index)}
        >
          {stickerSet.id === RECENT_SYMBOL_SET_ID ? (
            <Icon name="recent" />
          ) : stickerSet.id === FAVORITE_SYMBOL_SET_ID ? (
            <Icon name="favorite" />
          ) : stickerSet.id === CHAT_STICKER_SET_ID ? (
            <Avatar peer={chat} size="small" />
          ) : (stickerSet.stickers && (
              <StickerSetCover
                stickerSet={stickerSet as ApiStickerSet}
                noPlay={!canAnimate || !loadAndPlay}
                observeIntersection={observeIntersectionForCovers}
                sharedCanvasRef={withSharedCanvas ? sharedCanvasRef : undefined}
                forcePlayback
              />
            )
          )}
        </Button>
      );
    } else {
      return (
        <StickerButton
          key={stickerSet.id}
          sticker={firstSticker}
          size={STICKER_SIZE_PICKER_HEADER}
          title={stickerSet.title}
          className={buttonClassName}
          noPlay={!canAnimate || !loadAndPlay}
          observeIntersection={observeIntersectionForCovers}
          noContextMenu
          isCurrentUserPremium
          sharedCanvasRef={withSharedCanvas ? sharedCanvasRef : undefined}
          withTranslucentThumb={isTranslucent}
          onClick={selectStickerSet}
          clickArg={index}
          forcePlayback
        />
      );
    }
  }

  const fullClassName = buildClassName(styles.root, className);

  if (!shouldRenderContents) {
    return (
      <div className={fullClassName}>
        {!canSendStickers && !isForEffects ? (
          <div className={styles.pickerDisabled}>{lang('ErrorSendRestrictedStickersAll')}</div>
        ) : noPopulatedSets ? (
          <div className={styles.pickerDisabled}>{lang('NoStickers')}</div>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  const headerClassName = buildClassName(
    styles.header,
    'no-scrollbar',
    !shouldHideTopBorder && styles.headerWithBorder,
  );

  function renderContent() {
    if (!searchFilter && featuredIds) {
      return featuredIds.map((id) => (
        <StickerSetResult
          key={id}
          stickerSetId={id}
          observeIntersection={observeIntersection}
          observeIntersectionForShowingItems={observeIntersectionForShowingItems}
          isModalOpen={isModalOpen}
        />
      ));
    }

    if (searchResults) {
      if (!searchResults.length) {
        return <p className="helper-text" dir="auto">Nothing found.</p>;
      }

      return searchResults.map((id) => (
        <StickerSetResult
          key={id}
          stickerSetId={id}
          observeIntersection={observeIntersection}
          observeIntersectionForShowingItems={observeIntersectionForShowingItems}
          isModalOpen={isModalOpen}
        />
      ));
    }

    return <Loading />;
  }

  return (
    <div className={fullClassName}>
      { !isForEffects && !searchFocused && !searchFilter && !emojiCategoryFilter && !noPopulatedSets && (
        <div ref={headerRef} className={headerClassName}>
          <div className="shared-canvas-container">
            <canvas ref={sharedCanvasRef} className="shared-canvas" />
            {allSets.map(renderCover)}
          </div>
        </div>
      ) }
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onScroll={handleContentScroll}
        className={
          buildClassName(
            styles.main,
            IS_TOUCH_ENV ? 'no-scrollbar' : 'custom-scroll',
            !isForEffects && !searchFocused && !searchFilter && !emojiCategoryFilter && !noPopulatedSets && styles.hasHeader,
          )
        }
      >
        <div className="sticker-search">
          <SearchInput
            value={searchFilter}
            inputId="sticker-search"
            placeholder={lang('Search Stickers')}
            onChange={(filter) => {
              setSearchFilter(filter);
              setEmojiCategoryFilter('');
              searchStickers(filter);
            }}
            focused={isSearchFocused}
            onFocus={() => {
              setSearchFocused(true);
              onSearchFocused?.(true);
            }}
            onBlur={() => {
              onSearchFocused?.(false);
            }}
            withEmojiCategories={!searchFocused && !searchFilter && !noPopulatedSets}
            emojiCategory={emojiCategoryFilter}
            canClose={!noPopulatedSets || (noPopulatedSets && !!searchFilter)}
            withBackIcon={(searchFocused || emojiCategoryFilter !== '') && !noPopulatedSets}
            onReset={() => {
              setSearchFocused(false);
              setSearchFilter('');
              setEmojiCategoryFilter('');
              onSearchFocused?.(false);
            }}
            onEmojiCategoryClick={(category) => {
              setEmojiCategoryFilter(category);
              setSearchFilter('');
            }}
          />
        </div>
        {!searchFocused && !searchFilter && filteredSets.map((stickerSet, i) => (
          <StickerSet
            key={stickerSet.id}
            stickerSet={stickerSet}
            loadAndPlay={Boolean(canAnimate && loadAndPlay)}
            noContextMenus={noContextMenus}
            index={i}
            idPrefix={prefix}
            observeIntersection={observeIntersectionForSet}
            observeIntersectionForPlayingItems={observeIntersectionForPlayingItems}
            observeIntersectionForShowingItems={observeIntersectionForShowingItems}
            isNearActive={activeSetIndex >= i - 1 && activeSetIndex <= i + 1}
            favoriteStickers={favoriteStickers}
            isSavedMessages={isSavedMessages}
            isCurrentUserPremium={isCurrentUserPremium}
            isTranslucent={isTranslucent}
            isChatStickerSet={stickerSet.id === chatStickerSetId}
            onStickerSelect={handleStickerSelect}
            onStickerUnfave={handleStickerUnfave}
            onStickerFave={handleStickerFave}
            onStickerRemoveRecent={handleRemoveRecentSticker}
            forcePlayback
            shouldHideHeader={stickerSet.id === EFFECT_EMOJIS_SET_ID}
            filterStickers={emojiCategoryFilter ? (sticker => sticker.emoji ? !!matchingEmojis?.[sticker.emoji] : false) : undefined}
          />
        ))}
        {(searchFilter || searchFocused || noPopulatedSets) && (
          <div className="sticker-search-results" ref={searchResultsRef}>
            {renderContent()}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { chatId }): StateProps => {
    const {
      setsById,
      added,
      recent,
      favorite,
      effect,
      featured,
    } = global.stickers;

    const isSavedMessages = selectIsChatWithSelf(global, chatId);
    const chat = selectChat(global, chatId);
    const chatStickerSetId = !isUserId(chatId) ? selectChatFullInfo(global, chatId)?.stickerSet?.id : undefined;

    return {
      chat,
      effectStickers: effect?.stickers,
      effectEmojis: effect?.emojis,
      recentStickers: recent.stickers,
      favoriteStickers: favorite.stickers,
      stickerSetsById: setsById,
      addedSetIds: added.setIds,
      featuredIds: featured.setIds,
      canAnimate: selectShouldLoopStickers(global),
      isSavedMessages,
      isCurrentUserPremium: selectIsCurrentUserPremium(global),
      isModalOpen: Boolean(selectTabState(global).openedStickerSetShortName),
      chatStickerSetId,
    };
  },
)(StickerPicker));
