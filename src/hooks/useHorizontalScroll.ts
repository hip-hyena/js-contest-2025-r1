import { useEffect } from '../lib/teact/teact';

const useHorizontalScroll = (
  containerRef: React.RefObject<HTMLDivElement>,
  isDisabled?: boolean,
  shouldPreventDefault = false,
  shouldStopPropagation = false,
) => {
  useEffect(() => {
    if (isDisabled) {
      return undefined;
    }

    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    function handleScroll(e: WheelEvent) {
      // Ignore horizontal scroll and let it work natively (e.g. on touchpad)
      let isStuck = false;
      if (!e.deltaX) {
        isStuck = (e.deltaY < 0 && container!.scrollLeft === 0) || (e.deltaY > 0 && container!.scrollLeft >= container!.scrollWidth - container!.clientWidth - 1);
        container!.scrollLeft += e.deltaY / 4;
        if (shouldPreventDefault) e.preventDefault();
      } else {
        isStuck = (e.deltaX < 0 && container!.scrollLeft === 0) || (e.deltaX > 0 && container!.scrollLeft >= container!.scrollWidth - container!.clientWidth - 1);
      }
      if (shouldStopPropagation && !isStuck) {
        e.stopPropagation();
      }
    }

    container.addEventListener('wheel', handleScroll, { passive: !shouldPreventDefault });

    return () => {
      container.removeEventListener('wheel', handleScroll);
    };
  }, [containerRef, isDisabled, shouldPreventDefault]);
};

export default useHorizontalScroll;
