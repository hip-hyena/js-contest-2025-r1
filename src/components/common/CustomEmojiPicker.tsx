import type { FC } from '../../lib/teact/teact';
import React, {
  memo, useEffect, useMemo, useRef, useState,
} from '../../lib/teact/teact';
import { getGlobal, withGlobal } from '../../global';

import type {
  ApiAvailableReaction, ApiReaction, ApiReactionWithPaid, ApiSticker, ApiStickerSet,
} from '../../api/types';
import type { StickerSetOrReactionsSetOrRecent } from '../../types';

import {
  FAVORITE_SYMBOL_SET_ID,
  POPULAR_SYMBOL_SET_ID,
  RECENT_SYMBOL_SET_ID,
  SIMPLE_EMOJI_SET_ID,
  SLIDE_TRANSITION_DURATION,
  STICKER_PICKER_MAX_SHARED_COVERS,
  STICKER_SIZE_PICKER_HEADER,
  TOP_SYMBOL_SET_ID,
} from '../../config';
import { isSameReaction } from '../../global/helpers';
import {
  selectCanPlayAnimatedEmojis,
  selectChatFullInfo,
  selectIsAlwaysHighPriorityEmoji,
  selectIsChatWithSelf,
  selectIsCurrentUserPremium,
} from '../../global/selectors';
import animateHorizontalScroll from '../../util/animateHorizontalScroll';
import buildClassName from '../../util/buildClassName';
import { pickTruthy, unique } from '../../util/iteratees';
import { IS_TOUCH_ENV } from '../../util/windowEnvironment';
import { REM } from './helpers/mediaDimensions';

import useAppLayout from '../../hooks/useAppLayout';
import useHorizontalScroll from '../../hooks/useHorizontalScroll';
import useLastCallback from '../../hooks/useLastCallback';
import useOldLang from '../../hooks/useOldLang';
import usePrevDuringAnimation from '../../hooks/usePrevDuringAnimation';
import useScrolledState from '../../hooks/useScrolledState';
import useAsyncRendering from '../right/hooks/useAsyncRendering';
import { useStickerPickerObservers } from './hooks/useStickerPickerObservers';

import StickerSetCover from '../middle/composer/StickerSetCover';
import Button from '../ui/Button';
import Loading from '../ui/Loading';
import Icon from './icons/Icon';
import StickerButton from './StickerButton';
import StickerSet from './StickerSet';

import pickerStyles from '../middle/composer/StickerPicker.module.scss';
import styles from './CustomEmojiPicker.module.scss';
import SearchInput from '../ui/SearchInput';
import { IconName } from '../../types/icons';
import EmojiCategory from '../middle/composer/EmojiCategory';
import { ensureEmojiData } from '../middle/composer/EmojiPicker';
import { EmojiCategoryData } from '../middle/composer/EmojiPicker';
import { MEMO_EMPTY_ARRAY } from '../../util/memo';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';
import EmojiButton from '../middle/composer/EmojiButton';

const ICONS_BY_CATEGORY: Record<string, IconName> = {
  recent: 'recent',
  people: 'smile',
  nature: 'animals',
  foods: 'eats',
  activity: 'sport',
  places: 'car',
  objects: 'lamp',
  symbols: 'language',
  flags: 'flag',
};

type OwnProps = {
  chatId?: string;
  className?: string;
  pickerListClassName?: string;
  isHidden?: boolean;
  loadAndPlay: boolean;
  idPrefix?: string;
  withDefaultTopicIcons?: boolean;
  withFolderIcons?: boolean;
  withEmojiSearch?: boolean;
  withSimpleEmojis?: boolean;
  noRecent?: boolean;
  selectedReactionIds?: string[];
  isStatusPicker?: boolean;
  isReactionPicker?: boolean;
  isTranslucent?: boolean;
  isSearchFocused?: boolean;
  onSearchFocused?: (focused: boolean) => void;
  onCustomEmojiSelect: (sticker: ApiSticker) => void;
  onSimpleEmojiSelect?: (emoji: string, name: string) => void;
  onReactionSelect?: (reaction: ApiReactionWithPaid) => void;
  onReactionContext?: (reaction: ApiReactionWithPaid) => void;
  onContextMenuOpen?: NoneToVoidFunction;
  onContextMenuClose?: NoneToVoidFunction;
  onContextMenuClick?: NoneToVoidFunction;
};

type StateProps = {
  customEmojisById?: Record<string, ApiSticker>;
  recentCustomEmojiIds?: string[];
  recentStatusEmojis?: ApiSticker[];
  chatEmojiSetId?: string;
  topReactions?: ApiReaction[];
  recentReactions?: ApiReaction[];
  defaultTagReactions?: ApiReaction[];
  stickerSetsById: Record<string, ApiStickerSet>;
  availableReactions?: ApiAvailableReaction[];
  addedCustomEmojiIds?: string[];
  defaultTopicIconsId?: string;
  defaultStatusIconsId?: string;
  customEmojiFeaturedIds?: string[];
  canAnimate?: boolean;
  isSavedMessages?: boolean;
  isCurrentUserPremium?: boolean;
  isWithPaidReaction?: boolean;
};

const HEADER_BUTTON_WIDTH = 2.5 * REM; // px (including margin)

const DEFAULT_ID_PREFIX = 'custom-emoji-set';
const TOP_REACTIONS_COUNT = 16;
const RECENT_REACTIONS_COUNT = 32;
const RECENT_DEFAULT_STATUS_COUNT = 7;
const FADED_BUTTON_SET_IDS = new Set([RECENT_SYMBOL_SET_ID, SIMPLE_EMOJI_SET_ID, FAVORITE_SYMBOL_SET_ID, POPULAR_SYMBOL_SET_ID]);
const STICKER_SET_IDS_WITH_COVER = new Set([
  RECENT_SYMBOL_SET_ID,
  SIMPLE_EMOJI_SET_ID,
  FAVORITE_SYMBOL_SET_ID,
  POPULAR_SYMBOL_SET_ID,
]);
const FOLDER_ICONS: { icon: IconName, emoji: string }[] = [
  { icon: 'folder-chats', emoji: '💬' },
  { icon: 'folder-chat', emoji: '✅' },
  { icon: 'folder-user', emoji: '👤' },
  { icon: 'folder-group', emoji: '👥' },
  { icon: 'folder-star', emoji: '⭐' },
  { icon: 'folder-channel', emoji: '📢' },
  { icon: 'folder-bot', emoji: '🤖' },
  { icon: 'folder-default', emoji: '📁' },
];
const categoryIntersections: boolean[] = [];
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

const CustomEmojiPicker: FC<OwnProps & StateProps> = ({
  className,
  pickerListClassName,
  isHidden,
  loadAndPlay,
  addedCustomEmojiIds,
  customEmojisById,
  recentCustomEmojiIds,
  selectedReactionIds,
  recentStatusEmojis,
  stickerSetsById,
  chatEmojiSetId,
  topReactions,
  recentReactions,
  availableReactions,
  idPrefix = DEFAULT_ID_PREFIX,
  customEmojiFeaturedIds,
  canAnimate,
  isReactionPicker,
  isStatusPicker,
  isTranslucent,
  isSearchFocused,
  isSavedMessages,
  isCurrentUserPremium,
  withDefaultTopicIcons,
  withFolderIcons,
  withEmojiSearch,
  withSimpleEmojis,
  noRecent,
  defaultTopicIconsId,
  defaultStatusIconsId,
  defaultTagReactions,
  isWithPaidReaction,
  onSearchFocused,
  onCustomEmojiSelect,
  onSimpleEmojiSelect,
  onReactionSelect,
  onReactionContext,
  onContextMenuOpen,
  onContextMenuClose,
  onContextMenuClick,
}) => {
  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const headerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const emojiCategoriesRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const sharedCanvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line no-null/no-null
  const sharedCanvasHqRef = useRef<HTMLCanvasElement>(null);

  const [categories, setCategories] = useState<EmojiCategoryData[]>();
  const [emojis, setEmojis] = useState<AllEmojis>();
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [searchFilter, setSearchFilter] = useState('');
  const [emojiCategoryFilter, setEmojiCategoryFilter] = useState('');

  const { isMobile } = useAppLayout();
  const {
    handleScroll: handleContentScroll,
    isAtBeginning: shouldHideTopBorder,
  } = useScrolledState();

  const recentCustomEmojis = useMemo(() => {
    return isStatusPicker
      ? recentStatusEmojis
      : Object.values(pickTruthy(customEmojisById!, recentCustomEmojiIds!));
  }, [customEmojisById, isStatusPicker, recentCustomEmojiIds, recentStatusEmojis]);

  const prefix = `${idPrefix}-custom-emoji`;
  const {
    activeSetIndex,
    setActiveSetIndex,
    observeIntersectionForSet,
    observeIntersectionForPlayingItems,
    observeIntersectionForShowingItems,
    observeIntersectionForCovers,
    selectStickerSet,
  } = useStickerPickerObservers(containerRef, headerRef, prefix, isHidden);

  const canLoadAndPlay = usePrevDuringAnimation(loadAndPlay || undefined, SLIDE_TRANSITION_DURATION);

  const lang = useOldLang();

  const areAddedLoaded = Boolean(addedCustomEmojiIds);

  const allCategories = useMemo(() => {
    if (!categories) {
      return MEMO_EMPTY_ARRAY;
    }
    const themeCategories = [...categories];
    return themeCategories;
  }, [categories, lang]);

  const { observe: observeIntersection } = useIntersectionObserver({
    rootRef: containerRef,
    throttleMs: 200,
  }, (entries) => {
    entries.forEach((entry) => {
      const { id } = entry.target as HTMLDivElement;
      if (!id || !id.startsWith('emoji-category-')) {
        return;
      }

      const index = Number(id.replace('emoji-category-', ''));
      categoryIntersections[index] = entry.isIntersecting;
    });

    const minIntersectingIndex = categoryIntersections.reduce((lowestIndex, isIntersecting, index) => {
      return isIntersecting && index < lowestIndex ? index : lowestIndex;
    }, Infinity);

    if (minIntersectingIndex === Infinity) {
      return;
    }

    setActiveSetIndex(0);
    setActiveCategoryIndex(minIntersectingIndex);
  });

  const allSets = useMemo(() => {
    const defaultSets: StickerSetOrReactionsSetOrRecent[] = [];

    if (isReactionPicker && isSavedMessages) {
      if (defaultTagReactions?.length) {
        defaultSets.push({
          id: TOP_SYMBOL_SET_ID,
          accessHash: '',
          title: lang('PremiumPreviewTags'),
          reactions: defaultTagReactions,
          count: defaultTagReactions.length,
          isEmoji: true,
        });
      }
    }

    if (!noRecent) {
      if (isReactionPicker && !isSavedMessages) {
        const topReactionsSlice: ApiReactionWithPaid[] = topReactions?.slice(0, TOP_REACTIONS_COUNT) || [];
        if (isWithPaidReaction) {
          topReactionsSlice.unshift({ type: 'paid' });
        }
        if (topReactionsSlice?.length) {
          defaultSets.push({
            id: TOP_SYMBOL_SET_ID,
            accessHash: '',
            title: lang('Reactions'),
            reactions: topReactionsSlice,
            count: topReactionsSlice.length,
            isEmoji: true,
          });
        }

        const cleanRecentReactions = (recentReactions || [])
          .filter((reaction) => !topReactionsSlice.some((topReaction) => isSameReaction(topReaction, reaction)))
          .slice(0, RECENT_REACTIONS_COUNT);
        const cleanAvailableReactions = (availableReactions || [])
          .filter(({ isInactive }) => !isInactive)
          .map(({ reaction }) => reaction)
          .filter((reaction) => {
            return !topReactionsSlice.some((topReaction) => isSameReaction(topReaction, reaction))
              && !cleanRecentReactions.some((topReaction) => isSameReaction(topReaction, reaction));
          });
        if (cleanAvailableReactions?.length || cleanRecentReactions?.length) {
          const isPopular = !cleanRecentReactions?.length;
          const allRecentReactions = cleanRecentReactions.concat(cleanAvailableReactions);
          defaultSets.push({
            id: isPopular ? POPULAR_SYMBOL_SET_ID : RECENT_SYMBOL_SET_ID,
            accessHash: '',
            title: lang(isPopular ? 'PopularReactions' : 'RecentStickers'),
            reactions: allRecentReactions,
            count: allRecentReactions.length,
            isEmoji: true,
          });
        }
      } else if (isStatusPicker) {
        const defaultStatusIconsPack = stickerSetsById[defaultStatusIconsId!];
        if (defaultStatusIconsPack?.stickers?.length) {
          const stickers = defaultStatusIconsPack.stickers
            .slice(0, RECENT_DEFAULT_STATUS_COUNT)
            .concat(recentCustomEmojis || []);
          defaultSets.push({
            ...defaultStatusIconsPack,
            stickers,
            count: stickers.length,
            id: RECENT_SYMBOL_SET_ID,
            title: lang('RecentStickers'),
          });
        }
      } else if (withDefaultTopicIcons) {
        const defaultTopicIconsPack = stickerSetsById[defaultTopicIconsId!];
        if (defaultTopicIconsPack.stickers?.length) {
          defaultSets.push({
            ...defaultTopicIconsPack,
            id: RECENT_SYMBOL_SET_ID,
            title: lang('RecentStickers'),
          });
        }
      } else if (recentCustomEmojis?.length) {
        defaultSets.push({
          id: RECENT_SYMBOL_SET_ID,
          accessHash: '0',
          title: lang('RecentStickers'),
          stickers: recentCustomEmojis,
          count: recentCustomEmojis.length,
          isEmoji: true,
        });
      }
    }

    if (withSimpleEmojis) {
      // @ts-ignore
      defaultSets.push(...allCategories.map((category, i) => ({
        id: `${SIMPLE_EMOJI_SET_ID}-${category.id}`,
        accessHash: '',
        title: '',
        count: 0,
        isFirstCategory: i === 0,
        isEmoji: true,
      })));
    }

    const userSetIds = [...(addedCustomEmojiIds || [])];
    if (chatEmojiSetId) {
      userSetIds.unshift(chatEmojiSetId);
    }

    const setIdsToDisplay = unique(userSetIds.concat(customEmojiFeaturedIds || []));

    const setsToDisplay = Object.values(pickTruthy(stickerSetsById, setIdsToDisplay));

    return [
      ...defaultSets,
      ...setsToDisplay,
    ];
  }, [
    addedCustomEmojiIds, isReactionPicker, isStatusPicker, withDefaultTopicIcons, recentCustomEmojis,
    customEmojiFeaturedIds, stickerSetsById, topReactions, availableReactions, lang, recentReactions,
    defaultStatusIconsId, defaultTopicIconsId, isSavedMessages, defaultTagReactions, chatEmojiSetId,
    isWithPaidReaction, allCategories,
  ]);

  const noPopulatedSets = useMemo(() => (
    areAddedLoaded
    && allSets.filter((set) => set.stickers?.length).length === 0
  ), [allSets, areAddedLoaded]);
  
  const filteredEmojis = useMemo(() => {
    if (!emojis || (!searchFilter && !emojiCategoryFilter)) {
      return MEMO_EMPTY_ARRAY;
    }
    const filter = searchFilter && searchFilter.toLocaleLowerCase();
    const native = EMOJI_CATEGORIES[emojiCategoryFilter as keyof typeof EMOJI_CATEGORIES];
    const simple = Object.values(emojis).filter((emoji) => {
      if (native && (emoji as Emoji).native === native) {
        return true;
      }
      if (!filter) {
        return false;
      }
      if ('names' in emoji) {
        return emoji.names.some((name) => name.includes(filter));
      }
      return Object.values(emoji).some((emoji) => emoji.names.some((name) => name.includes(filter)));
    });
    let custom = allSets.map((set) => set.stickers?.filter((sticker) => {
      return sticker.emoji && (sticker.emoji === native);
    }) || []).flat();
    return [...simple, ...custom];
  }, [emojis, allSets, searchFilter, emojiCategoryFilter]);

  const canRenderContent = useAsyncRendering([], SLIDE_TRANSITION_DURATION);
  const shouldRenderContent = areAddedLoaded && canRenderContent && !noPopulatedSets;
  const isEmojiActive = useMemo(() => (allSets[activeSetIndex]?.id || '').startsWith(SIMPLE_EMOJI_SET_ID), [allSets, activeSetIndex]);

  useHorizontalScroll(headerRef, isMobile || !shouldRenderContent);
  useHorizontalScroll(emojiCategoriesRef, isMobile || !shouldRenderContent, true, true);
  // Scroll container and header when active set changes
  useEffect(() => {
    if (!areAddedLoaded) {
      return;
    }

    const header = headerRef.current;
    if (!header) {
      return;
    }

    const newLeft = isEmojiActive ? 0 : ((activeSetIndex - (allCategories.length - 1)) * HEADER_BUTTON_WIDTH - (header.offsetWidth / 2 - HEADER_BUTTON_WIDTH / 2));

    animateHorizontalScroll(header, newLeft);

    if (!emojiCategoriesRef.current) {
      return;
    }

    if (isEmojiActive) {
      const categoryId = (allSets[activeSetIndex]?.id || '').split('-')[1]
      const categoryIdx = allCategories.findIndex((category) => category.id === categoryId);
      const newCategoryLeft = categoryIdx * HEADER_BUTTON_WIDTH - (150 / 2 - HEADER_BUTTON_WIDTH / 2);
      animateHorizontalScroll(emojiCategoriesRef.current, newCategoryLeft);
    } else {
      animateHorizontalScroll(emojiCategoriesRef.current, 0);
    }
  }, [areAddedLoaded, activeSetIndex, isEmojiActive]);

  // Initialize data on first render.
  useEffect(() => {
    setTimeout(async () => {
      const emojiData = await ensureEmojiData();
      setCategories(emojiData.categories);
      setEmojis(emojiData.emojis as AllEmojis);
    }, 200);
  }, []);

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

  const handleEmojiSelect = useLastCallback((emoji: ApiSticker) => {
    onCustomEmojiSelect(emoji);
  });

  const handleSimpleEmojiSelect = useLastCallback((emoji: string, name: string) => {
    onSimpleEmojiSelect && onSimpleEmojiSelect(emoji, name);
  });


  function renderCover(stickerSet: StickerSetOrReactionsSetOrRecent, index: number) {
    const firstSticker = stickerSet.stickers?.[0];
    const buttonClassName = buildClassName(
      pickerStyles.stickerCover,
      index === activeSetIndex && styles.activated,
    );

    const withSharedCanvas = index < STICKER_PICKER_MAX_SHARED_COVERS;
    const isHq = selectIsAlwaysHighPriorityEmoji(getGlobal(), stickerSet as ApiStickerSet);

    if (stickerSet.id === TOP_SYMBOL_SET_ID) {
      return undefined;
    }

    const isSimpleEmojis = stickerSet.id.startsWith(SIMPLE_EMOJI_SET_ID);
    if (STICKER_SET_IDS_WITH_COVER.has(stickerSet.id) || stickerSet.hasThumbnail || !firstSticker || isSimpleEmojis) {
      const isRecent = stickerSet.id === RECENT_SYMBOL_SET_ID || stickerSet.id === POPULAR_SYMBOL_SET_ID;
      const isFaded = FADED_BUTTON_SET_IDS.has(stickerSet.id) || isSimpleEmojis;
      if (isSimpleEmojis) {
        // @ts-ignore
        if (!stickerSet.isFirstCategory) {
          return;
        }
        return (
          <div 
            ref={emojiCategoriesRef}
            className={buildClassName(
              'emoji-categories-button',
              isEmojiActive && 'is-active',
            )}>{
            allCategories.map((category, i) => (
              <Button
                key={`${stickerSet.id}-${category.id}`}
                className={buildClassName(
                  'emoji-button',
                  index + i === activeSetIndex && 'is-active',
                )}
                ariaLabel={category.name}
                round
                size='tiny'
                faded={isFaded}
                color="translucent"
                // eslint-disable-next-line react/jsx-no-bind
                  onClick={() => selectStickerSet(index + i)}
                >
                <Icon name={ICONS_BY_CATEGORY[category.id]} />
              </Button>
            ))
          }</div>
        );
      }
      return (
        <Button
          key={stickerSet.id}
          className={isRecent ? buildClassName(
            'recent-button',
            index === activeSetIndex && styles.activated,
          ) : buttonClassName}
          ariaLabel={stickerSet.title}
          round
          size={isRecent ? 'tiny' : 'default'}
          faded={isFaded}
          color="translucent"
          // eslint-disable-next-line react/jsx-no-bind
          onClick={() => selectStickerSet(isRecent ? 0 : index)}
        >
          {isRecent ? (
            <Icon name="recent" />
          ) : (
            <StickerSetCover
              stickerSet={stickerSet as ApiStickerSet}
              noPlay={!canAnimate || !canLoadAndPlay}
              forcePlayback
              observeIntersection={observeIntersectionForCovers}
              sharedCanvasRef={withSharedCanvas ? (isHq ? sharedCanvasHqRef : sharedCanvasRef) : undefined}
            />
          )}
        </Button>
      );
    }

    return (
      <StickerButton
        key={stickerSet.id}
        sticker={firstSticker}
        size={STICKER_SIZE_PICKER_HEADER}
        title={stickerSet.title}
        className={buttonClassName}
        noPlay={!canAnimate || !canLoadAndPlay}
        observeIntersection={observeIntersectionForCovers}
        noContextMenu
        isCurrentUserPremium
        sharedCanvasRef={withSharedCanvas ? (isHq ? sharedCanvasHqRef : sharedCanvasRef) : undefined}
        withTranslucentThumb={isTranslucent}
        onClick={selectStickerSet}
        clickArg={index}
        forcePlayback
      />
    );
  }

  const fullClassName = buildClassName('StickerPicker', styles.root, className);

  if (!shouldRenderContent) {
    return (
      <div className={fullClassName}>
        {noPopulatedSets && !withSimpleEmojis ? (
          <div className={pickerStyles.pickerDisabled}>{lang('NoStickers')}</div>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  const headerClassName = buildClassName(
    pickerStyles.header,
    'no-scrollbar',
    !shouldHideTopBorder && pickerStyles.headerWithBorder,
  );
  const listClassName = buildClassName(
    pickerStyles.main,
    pickerStyles.main_customEmoji,
    IS_TOUCH_ENV ? 'no-scrollbar' : 'custom-scroll',
    pickerListClassName,
    pickerStyles.hasHeader,
  );

  return (
    <div className={fullClassName}>
      <div
        ref={headerRef}
        className={headerClassName}
      >
        <div className="shared-canvas-container">
          <canvas ref={sharedCanvasRef} className={buildClassName('shared-canvas', isEmojiActive && 'is-adjusted')} />
          <canvas ref={sharedCanvasHqRef} className={buildClassName('shared-canvas', isEmojiActive && 'is-adjusted')} />
          {allSets.map(renderCover)}
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={handleContentScroll}
        className={listClassName}
      >
        {withEmojiSearch && (
          <div className="emoji-search">
            <SearchInput
              value={searchFilter}
              focused={isSearchFocused}
              inputId="emoji-search"
              placeholder={lang('Search Emoji')}
              onChange={(filter) => {
                setSearchFilter(filter);
                setEmojiCategoryFilter('');
              }}
              onFocus={() => onSearchFocused?.(true)}
              onBlur={() => onSearchFocused?.(false)}
              withEmojiCategories={!searchFilter}
              emojiCategory={emojiCategoryFilter}
              canClose
              withBackIcon={emojiCategoryFilter !== ''}
              onReset={() => {
                setEmojiCategoryFilter('');
                setSearchFilter('');
                onSearchFocused?.(false);
              }}
              onEmojiCategoryClick={(category) => {
                setEmojiCategoryFilter(category);
                setSearchFilter('');
              }}
            />
          </div>
        )}
        {withEmojiSearch && filteredEmojis.length > 0 && (
          <div className="emoji-search-results symbol-set-container">
            {filteredEmojis.map((emoji) => {
              if ((emoji as ApiSticker).mediaType === 'sticker') {
                const sticker = emoji as ApiSticker;
                return (
                  <StickerButton
                    key={sticker.id}
                    sticker={sticker}
                    size={STICKER_SIZE_PICKER_HEADER}
                    observeIntersection={observeIntersection}
                    clickArg={sticker}
                    onClick={handleEmojiSelect}
                  />
                );
              }
              // Some emojis have multiple skins and are represented as an Object with emojis for all skins.
              // For now, we select only the first emoji with 'neutral' skin.
              const displayedEmoji = ('id' in emoji ? emoji : emoji[1]) as Emoji;

              return (
                <EmojiButton
                  key={displayedEmoji.id}
                  emoji={displayedEmoji}
                  focus={selectedReactionIds && selectedReactionIds.includes(displayedEmoji.native)}
                  onClick={handleSimpleEmojiSelect}
                />
              );
            })}
          </div>
        )}
        {withFolderIcons && filteredEmojis.length === 0 && (
          <div className="folder-icons">
            {FOLDER_ICONS.map(({ icon, emoji }) => {
              return (
                <div className={buildClassName(
                  'folder-icon-button',
                  'interactive',
                  selectedReactionIds && selectedReactionIds.includes(emoji) && 'focus'
                )} key={icon} onClick={() => handleSimpleEmojiSelect(emoji, "")}>
                  <Icon name={icon} />
                </div>
              );
            })}
          </div>
        )}
        
        {allSets.map((stickerSet, i) => {
          const shouldHideHeader = stickerSet.id === TOP_SYMBOL_SET_ID
            || (stickerSet.id === RECENT_SYMBOL_SET_ID && (withDefaultTopicIcons || isStatusPicker))
            || (stickerSet.id.startsWith(SIMPLE_EMOJI_SET_ID));
          const isChatEmojiSet = stickerSet.id === chatEmojiSetId;

          if (stickerSet.id.startsWith(SIMPLE_EMOJI_SET_ID)) {
            const categoryId = stickerSet.id.split('-')[1];
            const categoryIdx = allCategories.findIndex((category) => category.id === categoryId);
            return emojis && (
              <EmojiCategory
                id={`${prefix}-${i}`}
                key={stickerSet.id}
                category={allCategories.find((category) => category.id === categoryId) as EmojiCategory}
                index={categoryIdx + 1}
                allEmojis={emojis}
                selectedEmojis={selectedReactionIds}
                observeIntersection={observeIntersectionForSet}
                shouldRender={activeSetIndex >= i - 1 && activeSetIndex <= i + 1}
                onEmojiSelect={handleSimpleEmojiSelect}
              />
            );
          }

          return (
            <StickerSet
              key={stickerSet.id}
              stickerSet={stickerSet}
              loadAndPlay={Boolean(canAnimate && canLoadAndPlay)}
              index={i}
              idPrefix={prefix}
              observeIntersection={observeIntersectionForSet}
              observeIntersectionForPlayingItems={observeIntersectionForPlayingItems}
              observeIntersectionForShowingItems={observeIntersectionForShowingItems}
              isNearActive={activeSetIndex >= i - 1 && activeSetIndex <= i + 1}
              isSavedMessages={isSavedMessages}
              isStatusPicker={isStatusPicker}
              isReactionPicker={isReactionPicker}
              shouldHideHeader={shouldHideHeader}
              withDefaultTopicIcon={withDefaultTopicIcons && stickerSet.id === RECENT_SYMBOL_SET_ID}
              withDefaultStatusIcon={isStatusPicker && stickerSet.id === RECENT_SYMBOL_SET_ID}
              isChatEmojiSet={isChatEmojiSet}
              isCurrentUserPremium={isCurrentUserPremium}
              selectedReactionIds={selectedReactionIds}
              availableReactions={availableReactions}
              isTranslucent={isTranslucent}
              onReactionSelect={onReactionSelect}
              onReactionContext={onReactionContext}
              onStickerSelect={handleEmojiSelect}
              onContextMenuOpen={onContextMenuOpen}
              onContextMenuClose={onContextMenuClose}
              onContextMenuClick={onContextMenuClick}
              forcePlayback
            />
          );
        })}
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { chatId, isStatusPicker, isReactionPicker }): StateProps => {
    const {
      stickers: {
        setsById: stickerSetsById,
      },
      customEmojis: {
        byId: customEmojisById,
        featuredIds: customEmojiFeaturedIds,
        statusRecent: {
          emojis: recentStatusEmojis,
        },
      },
      recentCustomEmojis: recentCustomEmojiIds,
      reactions: {
        availableReactions,
        recentReactions,
        topReactions,
        defaultTags,
      },
    } = global;

    const isSavedMessages = Boolean(chatId && selectIsChatWithSelf(global, chatId));
    const chatFullInfo = chatId ? selectChatFullInfo(global, chatId) : undefined;

    return {
      customEmojisById: !isStatusPicker ? customEmojisById : undefined,
      recentCustomEmojiIds: !isStatusPicker ? recentCustomEmojiIds : undefined,
      recentStatusEmojis: isStatusPicker ? recentStatusEmojis : undefined,
      stickerSetsById,
      addedCustomEmojiIds: global.customEmojis.added.setIds,
      canAnimate: selectCanPlayAnimatedEmojis(global),
      isSavedMessages,
      isCurrentUserPremium: selectIsCurrentUserPremium(global),
      customEmojiFeaturedIds,
      defaultTopicIconsId: global.defaultTopicIconsId,
      defaultStatusIconsId: global.defaultStatusIconsId,
      topReactions: isReactionPicker ? topReactions : undefined,
      recentReactions: isReactionPicker ? recentReactions : undefined,
      chatEmojiSetId: chatFullInfo?.emojiSet?.id,
      isWithPaidReaction: isReactionPicker && chatFullInfo?.isPaidReactionAvailable,
      availableReactions: isReactionPicker ? availableReactions : undefined,
      defaultTagReactions: isReactionPicker ? defaultTags : undefined,
    };
  },
)(CustomEmojiPicker));
