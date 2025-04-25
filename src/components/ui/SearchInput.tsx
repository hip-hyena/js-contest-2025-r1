import type { RefObject } from 'react';
import type { FC } from '../../lib/teact/teact';
import React, {
  memo, useEffect, useRef,
  useState,
} from '../../lib/teact/teact';

import buildClassName from '../../util/buildClassName';

import useFlag from '../../hooks/useFlag';
import useInputFocusOnOpen from '../../hooks/useInputFocusOnOpen';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useOldLang from '../../hooks/useOldLang';
import useHorizontalScroll from '../../hooks/useHorizontalScroll';

import Icon from '../common/icons/Icon';
import Button from './Button';
import Loading from './Loading';
import Transition from './Transition';

import './SearchInput.scss';
import { IconName } from '../../types/icons';

type OwnProps = {
  ref?: RefObject<HTMLInputElement>;
  children?: React.ReactNode;
  resultsItemSelector?: string;
  className?: string;
  inputId?: string;
  value?: string;
  focused?: boolean;
  isLoading?: boolean;
  spinnerColor?: 'yellow';
  spinnerBackgroundColor?: 'light';
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  canClose?: boolean;
  autoFocusSearch?: boolean;
  hasUpButton?: boolean;
  hasDownButton?: boolean;
  teactExperimentControlled?: boolean;
  withBackIcon?: boolean;
  withEmojiCategories?: boolean;
  emojiCategory?: string;
  onChange: (value: string) => void;
  onStartBackspace?: NoneToVoidFunction;
  onReset?: NoneToVoidFunction;
  onFocus?: NoneToVoidFunction;
  onBlur?: NoneToVoidFunction;
  onClick?: NoneToVoidFunction;
  onUpClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDownClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onSpinnerClick?: NoneToVoidFunction;
  onEmojiCategoryClick?: (category: string) => void;
};

const SearchInput: FC<OwnProps> = ({
  ref,
  children,
  resultsItemSelector,
  value,
  inputId,
  className,
  focused,
  isLoading = false,
  spinnerColor,
  spinnerBackgroundColor,
  placeholder,
  disabled,
  autoComplete,
  canClose,
  autoFocusSearch,
  hasUpButton,
  hasDownButton,
  teactExperimentControlled,
  withBackIcon,
  withEmojiCategories,
  emojiCategory,
  onChange,
  onStartBackspace,
  onReset,
  onFocus,
  onBlur,
  onClick,
  onUpClick,
  onDownClick,
  onSpinnerClick,
  onEmojiCategoryClick,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputScrollableRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  let inputRef = useRef<HTMLInputElement>(null);
  if (ref) {
    inputRef = ref;
  }

  const [scrollPosition, setScrollPosition] = useState(0);

  const [isInputFocused, markInputFocused, unmarkInputFocused] = useFlag(focused);

  useInputFocusOnOpen(inputRef, autoFocusSearch, unmarkInputFocused);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }

    if (focused) {
      inputRef.current.focus();
    } else {
      inputRef.current.blur();
    }
  }, [focused, placeholder]); // Trick for setting focus when selecting a contact to search for

  const oldLang = useOldLang();
  const lang = useLang();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { currentTarget } = event;
    onChange(currentTarget.value);

    if (!isInputFocused) {
      handleFocus();
    }
  }

  function handleFocus() {
    markInputFocused();
    onFocus?.();
  }

  function handleBlur() {
    unmarkInputFocused();
    onBlur?.();
  }

  const handleKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!resultsItemSelector) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      const element = document.querySelector(resultsItemSelector) as HTMLElement;
      if (element) {
        element.focus();
      }
    }

    if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      onStartBackspace?.();
    }
  });

  const handleScroll = useLastCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (withEmojiCategories) {
      const element = e.currentTarget;
      const space = (wrapperRef.current?.clientWidth || 370) / 2 - 150;
      setScrollPosition(Math.max(0, element.scrollLeft - space));
    }
  });

  const emojiCategories = ['heart', 'like', 'dislike', 'party', 'haha', 'omg', 'sad', 'angry', 'neutral', 'what', 'tongue'];
  useHorizontalScroll(inputScrollableRef, false, true, true);


  return (
    <div
      ref={wrapperRef}
      className={buildClassName('SearchInput', className, isInputFocused && 'has-focus', withEmojiCategories && 'with-emoji-categories')}
      onClick={onClick}
      style={`--scroll-pos: ${scrollPosition}`}
      dir={oldLang.isRtl ? 'rtl' : undefined}
    >
      <Transition
        name="fade"
        shouldCleanup
        activeKey={Number(!isLoading && !withBackIcon)}
        className="icon-container-left"
        slideClassName="icon-container-slide"
      >
        {isLoading && !withBackIcon ? (
          <Loading color={spinnerColor} backgroundColor={spinnerBackgroundColor} onClick={onSpinnerClick} />
        ) : withBackIcon ? (
          <Icon name="arrow-left" className="back-icon" onClick={onReset} />
        ) : (
          <Icon name="search" className="search-icon" />
        )}
      </Transition>
      <div>{children}</div>
      <div ref={inputScrollableRef}
        className="input-scrollable"
        onScroll={handleScroll}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          dir="auto"
          placeholder={placeholder || oldLang('Search')}
          className="form-control"
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          teactExperimentControlled={teactExperimentControlled}
        />
        {withEmojiCategories && (
          <div className="emoji-categories">
            {emojiCategories.map((category) => (
              <Button
                key={category}
                round
                size="tiny"
                color="translucent"
                className={emojiCategory === category ? 'is-active' : ''}
                onClick={() => onEmojiCategoryClick?.(emojiCategory === category ? '' : category)}
              >
                <Icon name={`emoji-${category}` as IconName} />
              </Button>
            ))}
          </div>
        )}
      </div>
      {hasUpButton && (
        <Button
          round
          size="tiny"
          color="translucent"
          onClick={onUpClick}
          disabled={!onUpClick}
          ariaLabel={lang('AriaSearchOlderResult')}
        >
          <Icon name="up" />
        </Button>
      )}
      {hasDownButton && (
        <Button
          round
          size="tiny"
          color="translucent"
          onClick={onDownClick}
          disabled={!onDownClick}
          ariaLabel={lang('AriaSearchNewerResult')}
        >
          <Icon name="down" />
        </Button>
      )}
      <Transition
        name="fade"
        shouldCleanup
        activeKey={Number(isLoading)}
        className="icon-container-right"
        slideClassName="icon-container-slide"
      >
        {withBackIcon && isLoading ? (
          <Loading color={spinnerColor} backgroundColor={spinnerBackgroundColor} onClick={onSpinnerClick} />
        ) : (
          (value || canClose) && onReset && (
            <Button
              round
              size="tiny"
              color="translucent"
              onClick={onReset}
            >
              <Icon name="close" />
            </Button>
          )
        )}
      </Transition>
    </div>
  );
};

export default memo(SearchInput);
