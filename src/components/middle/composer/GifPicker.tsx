import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useRef,
} from '../../../lib/teact/teact';
import { getActions, getGlobal, withGlobal } from '../../../global';

import type { ApiVideo } from '../../../api/types';

import { SLIDE_TRANSITION_DURATION } from '../../../config';
import { selectCurrentGifSearch, selectCurrentMessageList, selectIsChatWithSelf } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { IS_TOUCH_ENV } from '../../../util/windowEnvironment';

import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import useLastCallback from '../../../hooks/useLastCallback';
import useAsyncRendering from '../../right/hooks/useAsyncRendering';

import GifButton from '../../common/GifButton';
import Loading from '../../ui/Loading';

import './GifPicker.scss';
import SearchInput from '../../ui/SearchInput';
import useOldLang from '../../../hooks/useOldLang';
import useScrolledState from '../../../hooks/useScrolledState';
import EmojiButton from './EmojiButton';
import { useState } from '../../../lib/teact/teact';
import { EmojiData, EmojiRawData, EmojiModule, uncompressEmoji } from '../../../util/emoji/emoji';
import useHorizontalScroll from '../../../hooks/useHorizontalScroll';
import InfiniteScroll from '../../ui/InfiniteScroll';
import { callApi } from '../../../api/gramjs';
import { debounce } from '../../../util/schedulers';
import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';
import { LoadMoreDirection } from '../../../types';
import animateScroll from '../../../util/animateScroll';
const searchThrottled = debounce((cb) => cb(), 500, false);

type OwnProps = {
  className: string;
  loadAndPlay: boolean;
  canSendGifs?: boolean;
  isSearchFocused?: boolean;
  onSearchFocused?: (focused: boolean) => void;
  onGifSelect?: (gif: ApiVideo, isSilent?: boolean, shouldSchedule?: boolean) => void;
};

type StateProps = {
  savedGifs?: ApiVideo[];
  isSavedMessages?: boolean;
};

const PRELOAD_BACKWARDS = 24; // GIF Search bot results are multiplied by 24
const INTERSECTION_DEBOUNCE = 300;

let emojiDataPromise: Promise<EmojiModule>;
let emojiRawData: EmojiRawData;
let emojiData: EmojiData;

const GifPicker: FC<OwnProps & StateProps> = ({
  className,
  loadAndPlay,
  canSendGifs,
  savedGifs,
  isSavedMessages,
  onGifSelect,
  isSearchFocused,
  onSearchFocused,
}) => {
  const {
    loadSavedGifs,
    saveGif,
  } = getActions();

  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const lang = useOldLang();
  const sharedCanvasRef = useRef<HTMLCanvasElement>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [emojiCategoryFilter, setEmojiCategoryFilter] = useState('');
  const [searchResults, setSearchResults] = useState<ApiVideo[] | undefined>(undefined);
  const [searchOffset, setSearchOffset] = useState('');
  const {
    handleScroll: handleContentScroll,
    isAtBeginning: shouldHideTopBorder,
  } = useScrolledState();

  const {
    observe: observeIntersection,
  } = useIntersectionObserver({ rootRef: containerRef, debounceMs: INTERSECTION_DEBOUNCE });

  useEffect(() => {
    if (loadAndPlay) {
      loadSavedGifs();
    }
  }, [loadAndPlay, loadSavedGifs]);

  const handleUnsaveClick = useLastCallback((gif: ApiVideo) => {
    saveGif({ gif, shouldUnsave: true });
  });

  const canRenderContents = useAsyncRendering([], SLIDE_TRANSITION_DURATION);
  
  const headerClassName = buildClassName(
    'GifPicker__header',
    'no-scrollbar',
    !shouldHideTopBorder && 'headerWithBorder',
  );

  const [gifCategories, setGifCategories] = useState<Emoji[]>([]);

  const scrollToTop = useLastCallback(() => {
    containerRef.current && animateScroll({
      container: containerRef.current,
      element: containerRef.current.firstElementChild as HTMLElement,
      position: 'start',
    });
  });
  
  useEffect(() => {
    if (isSearchFocused) {
      scrollToTop();
    }
  }, [isSearchFocused, scrollToTop]);

  useEffect(() => {
    if (!shouldHideTopBorder) {
      onSearchFocused?.(false);
    }
  }, [shouldHideTopBorder, onSearchFocused]);

  async function ensureEmojiData() {
    if (!emojiDataPromise) {
      emojiDataPromise = import('emoji-data-ios/emoji-data.json');
      emojiRawData = (await emojiDataPromise).default;
  
      emojiData = uncompressEmoji(emojiRawData);
    }
  
    return emojiDataPromise;
  }
  ensureEmojiData().then(() => {
    setGifCategories(['+1', 'kissing_heart', 'heart_eyes', 'rage', 'partying_face', 'joy', 'open_mouth', 'face_with_rolling_eyes', 'sunglasses', '-1'].map(
     (emoji) => emojiData.emojis[emoji]));
  });

  let isLoading: string | null = null;
  async function searchMoreGifs(query: string, reset = false) {
    //console.error('searchMoreGifs', query, reset);
    if (!reset && isLoading === query) {
      return;
    }
    isLoading = query;
    void searchThrottled(async () => {
      if (reset) {
        setSearchOffset('');
        //setSearchResults(undefined);
      } else
      if (searchOffset === '-') {
        return;
      }
      const global = getGlobal();
      const result = await callApi('searchGifs', { query, offset: reset ? '' : searchOffset, username: global.config?.gifSearchUsername });
      //console.error('results for query ' + query, result);
      isLoading = null;
      if (!result) {
        return;
      }
      setSearchResults(reset ? result.gifs : [...(searchResults || []), ...result.gifs]);
      setSearchOffset(result.nextOffset || '-');
    });
  }

  useHorizontalScroll(headerRef);
  const hasResults = Boolean(searchFilter !== undefined && searchResults && searchResults.length);
  function renderContent() {
    //return <Loading />
    if (!(canRenderContents && (searchFilter || emojiCategoryFilter))) {
      return canRenderContents && savedGifs && savedGifs.length ? (
        savedGifs.map((gif) => (
          <GifButton
            key={gif.id}
            gif={gif}
            observeIntersection={observeIntersection}
            isDisabled={!loadAndPlay}
            onClick={canSendGifs ? onGifSelect : undefined}
            onUnsaveClick={handleUnsaveClick}
            isSavedMessages={isSavedMessages}
          />
        ))
      ) : canRenderContents && savedGifs ? (
        <div className="picker-disabled">No saved GIFs.</div>
      ) : (
        <Loading />
      )
    }

    if (searchFilter === undefined) {
      return undefined;
    }

    if (!searchResults) {
      return (
        <Loading />
      );
    }

    if (!searchResults.length) {
      return (
        <p className="helper-text" dir="auto">{lang('NoGIFsFound')}</p>
      );
    }

    return searchResults.map((gif) => (
      <GifButton
        key={gif.id}
        gif={gif}
        observeIntersection={observeIntersection}
        onClick={canSendGifs ? onGifSelect : undefined}
        isSavedMessages={isSavedMessages}
      />
    ));
  }

  return (
    <div>
      {canSendGifs && (
        <div ref={headerRef} className={headerClassName}>
          <Button
            className={emojiCategoryFilter ? '' : 'is-active'}
            color="translucent"
            size="tiny"
            round
            onClick={() => {
              setSearchFilter('');
              setEmojiCategoryFilter('');
              onSearchFocused?.(false);
              scrollToTop();
            }}
          >
            <Icon name="recent" />
          </Button>
          {gifCategories.map((category) => (
            <EmojiButton
              focus={emojiCategoryFilter === category.native}
              emoji={category}
              onClick={() => {
                setSearchFilter('');
                if (emojiCategoryFilter === category.native) {
                  setEmojiCategoryFilter('');
                } else {
                  setEmojiCategoryFilter(category.native);
                  searchMoreGifs(category.native, true);
                }
                onSearchFocused?.(false);
                scrollToTop();
              }}
            />
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        onScroll={handleContentScroll}
        className={buildClassName('GifPicker', className, IS_TOUCH_ENV ? 'no-scrollbar' : 'custom-scroll')}
      >
        {canSendGifs && (
          <div className="gif-search">
            <SearchInput
              value={searchFilter}
              inputId="gif-search"
              placeholder={lang('Search GIFs')}
              onChange={(value) => {
                if (value != searchFilter) {
                  setSearchFilter(value);
                  setEmojiCategoryFilter('');
                  searchMoreGifs(value, true);
                }
              }}
              focused={isSearchFocused}
              onFocus={() => onSearchFocused?.(true)}
              onBlur={() => onSearchFocused?.(false)}
            />
          </div>
        )}
        {!canSendGifs ? (
          <div className="picker-disabled">Sending GIFs is not allowed in this chat.</div>
        ) : (
          <InfiniteScroll
            ref={resultsRef}
            className={buildClassName('gif-container custom-scroll', (hasResults || !(searchFilter || emojiCategoryFilter)) && 'grid')}
            items={searchResults}
            scrollContainerClosest=".GifPicker"
            itemSelector=".GifButton"
            preloadBackwards={PRELOAD_BACKWARDS}
            noFastList
            onLoadMore={canRenderContents && (searchFilter || emojiCategoryFilter) && hasResults? ({ direction }) => {
              //console.log('Loading more gifs', direction);
              searchMoreGifs(searchFilter || emojiCategoryFilter);
            } : undefined}
          >
            {renderContent()}
          </InfiniteScroll>
        )}
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const { chatId } = selectCurrentMessageList(global) || {};
    const isSavedMessages = Boolean(chatId) && selectIsChatWithSelf(global, chatId);
    return {
      savedGifs: global.gifs.saved.gifs,
      isSavedMessages,
    };
  },
)(GifPicker));
