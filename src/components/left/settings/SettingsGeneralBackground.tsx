import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useRef,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiWallpaper } from '../../../api/types';
import type { ThemeKey } from '../../../types';
import { SettingsScreens, UPLOADING_WALLPAPER_SLUG } from '../../../types';

import { DARK_THEME_PATTERN_COLOR, DEFAULT_PATTERN_COLOR } from '../../../config';
import { selectTheme } from '../../../global/selectors';
import { getAverageColor, getPatternColor, hex2rgb, rgb2hex } from '../../../util/colors';
import { validateFiles } from '../../../util/files';
import { throttle } from '../../../util/schedulers';
import { openSystemFilesDialog } from '../../../util/systemFilesDialog';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useOldLang from '../../../hooks/useOldLang';

import Checkbox from '../../ui/Checkbox';
import ListItem from '../../ui/ListItem';
import Loading from '../../ui/Loading';
import WallpaperTile from './WallpaperTile';
import buildClassName from '../../../util/buildClassName';

import './SettingsGeneralBackground.scss';
import GradientWallpaper from '../../common/GradientWallpaper';
import { hexToRgb } from '../../../util/switchTheme';

type OwnProps = {
  isActive?: boolean;
  onScreenSelect: (screen: SettingsScreens) => void;
  onReset: () => void;
};

type StateProps = {
  background?: string;
  gradientColors?: string[];
  isBlurred?: boolean;
  isDark?: boolean;
  loadedWallpapers?: ApiWallpaper[];
  theme: ThemeKey;
};

const SUPPORTED_TYPES = 'image/jpeg';

const runThrottled = throttle((cb) => cb(), 60000, true);

const SettingsGeneralBackground: FC<OwnProps & StateProps> = ({
  isActive,
  onScreenSelect,
  onReset,
  background,
  gradientColors,
  isBlurred,
  isDark,
  loadedWallpapers,
  theme,
}) => {
  const {
    loadWallpapers,
    uploadWallpaper,
    setThemeSettings,
  } = getActions();

  const themeRef = useRef<ThemeKey>();
  themeRef.current = theme;
  // Due to the parent Transition, this component never gets unmounted,
  // that's why we use throttled API call on every update.
  useEffect(() => {
    runThrottled(() => {
      loadWallpapers();
    });
  }, [loadWallpapers]);

  const handleFileSelect = useCallback((e: Event) => {
    const { files } = e.target as HTMLInputElement;

    const validatedFiles = validateFiles(files);
    if (validatedFiles?.length) {
      uploadWallpaper(validatedFiles[0]);
    }
  }, [uploadWallpaper]);

  const handleUploadWallpaper = useCallback(() => {
    openSystemFilesDialog(SUPPORTED_TYPES, handleFileSelect, true);
  }, [handleFileSelect]);

  const handleSetColor = useCallback(() => {
    onScreenSelect(SettingsScreens.GeneralChatBackgroundColor);
  }, [onScreenSelect]);

  const handleResetToDefault = useCallback(() => {
    setThemeSettings({
      theme,
      background: undefined,
      backgroundColor: undefined,
      isBlurred: true,
      isDark: false,
      patternColor: theme === 'dark' ? DARK_THEME_PATTERN_COLOR : DEFAULT_PATTERN_COLOR,
      gradientColors: undefined,
    });
  }, [setThemeSettings, theme]);

  const handleWallpaperSelect = useCallback((slug?: string, colors?: string[], opacity?: number, dark?: boolean) => {
    let avgColor: [number, number, number] | undefined;
    if (colors) {
      avgColor = [0, 0, 0];
      for (const color of colors) {
        const rgb = hexToRgb(color);
        avgColor[0] += rgb.r;
        avgColor[1] += rgb.g;
        avgColor[2] += rgb.b;
      }
      avgColor[0] = Math.round(avgColor[0] / colors.length);
      avgColor[1] = Math.round(avgColor[1] / colors.length);
      avgColor[2] = Math.round(avgColor[2] / colors.length);
    }
    setThemeSettings({
      theme: themeRef.current!,
      background: slug || undefined,
      gradientColors: colors || undefined,
      patternOpacity: opacity,
      isDark: dark,
      ...(avgColor && {
        backgroundColor: `#${rgb2hex(avgColor)}`,
        patternColor: getPatternColor(avgColor),
        isBlurred: true,
      }),
    });
    if (slug) {
      const currentWallpaper = loadedWallpapers && loadedWallpapers.find((wallpaper) => wallpaper.slug === slug);
      if (currentWallpaper?.document?.thumbnail) {
        getAverageColor(currentWallpaper.document.thumbnail.dataUri)
          .then((color) => {
            const patternColor = getPatternColor(color);
            const rgbColor = `#${rgb2hex(color)}`;
            setThemeSettings({ theme: themeRef.current!, backgroundColor: rgbColor, patternColor });
          });
      }
    }
  }, [setThemeSettings, loadedWallpapers]);

  const handleWallPaperBlurChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setThemeSettings({ theme: themeRef.current!, isBlurred: e.target.checked });
  }, [setThemeSettings]);

  const lang = useOldLang();

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  const isUploading = loadedWallpapers?.[0] && loadedWallpapers[0].slug === UPLOADING_WALLPAPER_SLUG;

  return (
    <div className="SettingsGeneralBackground settings-content custom-scroll">
      <div className="settings-item pt-3">
        <ListItem
          icon="camera-add"
          className="mb-0"
          disabled={isUploading}
          onClick={handleUploadWallpaper}
        >
          {lang('UploadImage')}
        </ListItem>

        <ListItem
          icon="colorize"
          className="mb-0"
          onClick={handleSetColor}
        >
          {lang('SetColor')}
        </ListItem>

        <ListItem icon="favorite" onClick={handleResetToDefault}>
          {lang('ThemeResetToDefaults')}
        </ListItem>

        <Checkbox
          label={lang('BackgroundBlurred')}
          checked={Boolean(isBlurred)}
          disabled={!background}
          onChange={handleWallPaperBlurChange}
        />
      </div>

      {loadedWallpapers ? (
        <div className="settings-wallpapers">
          {loadedWallpapers.map((wallpaper) => {
            return wallpaper.document ? (<WallpaperTile
              key={wallpaper.slug}
              wallpaper={wallpaper}
              colors={wallpaper.colors && wallpaper.colors!.join(',')}
              opacity={wallpaper.opacity}
              dark={wallpaper.dark}
              theme={theme}
              isSelected={background === wallpaper.slug}
              onClick={handleWallpaperSelect}
            />) : (<div
              className={buildClassName('WallpaperTile', !background && gradientColors && gradientColors.join(',') === wallpaper.colors!.join(',') && 'selected')}
              onClick={() => handleWallpaperSelect(undefined, wallpaper.colors!, wallpaper.opacity, wallpaper.dark)}
            ><GradientWallpaper
              key={wallpaper.colors!.join(',')}
              className="media-inner"
              colors={wallpaper.colors!.join(',')}
              opacity={wallpaper.opacity}
              dark={wallpaper.dark}
            /></div>);
          })}
        </div>
      ) : (
        <Loading />
      )}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const theme = selectTheme(global);
    const { background, isDark, isBlurred, gradientColors } = global.settings.themes[theme] || {};
    const { loadedWallpapers } = global.settings;

    return {
      background,
      isBlurred,
      isDark,
      gradientColors,
      loadedWallpapers,
      theme,
    };
  },
)(SettingsGeneralBackground));
