import { getGlobal } from '../../global';

import type { ApiChatFolder, ApiSticker, ApiMessageEntity } from '../../api/types';
import type { IconName } from '../../types/icons';
import type { Dispatch, StateReducer } from '../useReducer';

import { selectChat } from '../../global/selectors';
import { omit, pick } from '../../util/iteratees';
import useReducer from '../useReducer';
import EMOJI_REGEX from '../../lib/twemojiRegex';

export type FolderChatType = {
  icon: IconName;
  title: string;
  key: keyof Pick<ApiChatFolder, (
    'contacts' | 'nonContacts' | 'groups' | 'channels' | 'bots' |
    'excludeMuted' | 'excludeArchived' | 'excludeRead'
  )>;
};

const INCLUDE_FILTER_FIELDS: Array<keyof FolderIncludeFilters> = [
  'includedChatIds', 'bots', 'channels', 'groups', 'contacts', 'nonContacts',
];
const EXCLUDE_FILTER_FIELDS: Array<keyof FolderExcludeFilters> = [
  'excludedChatIds', 'excludeArchived', 'excludeMuted', 'excludeRead',
];

export function selectChatFilters(state: FoldersState, mode: 'included' | 'excluded', selectTemp?: boolean) {
  let selectedChatIds: string[] = [];
  let selectedChatTypes: FolderChatType['key'][] = [];

  if (mode === 'included') {
    const {
      includedChatIds,
      ...includeFilters
    } = selectTemp
      ? state.includeFilters || {}
      : pick(
        state.folder,
        INCLUDE_FILTER_FIELDS,
      );

    selectedChatIds = includedChatIds || [];
    selectedChatTypes = (Object.keys(includeFilters) as Array<keyof typeof includeFilters>)
      .filter((key) => Boolean(includeFilters[key]));
  } else {
    const {
      excludedChatIds,
      ...excludeFilters
    } = selectTemp
      ? state.excludeFilters || {}
      : pick(
        state.folder,
        EXCLUDE_FILTER_FIELDS,
      );

    selectedChatIds = excludedChatIds || [];
    selectedChatTypes = (Object.keys(excludeFilters) as Array<keyof typeof excludeFilters>)
      .filter((key) => Boolean(excludeFilters[key]));
  }

  const global = getGlobal();
  const existingSelectedChatIds = selectedChatIds.filter((id) => selectChat(global, id));

  return {
    selectedChatIds: existingSelectedChatIds,
    selectedChatTypes,
  };
}

function getSuggestedFolderName(includeFilters?: FolderIncludeFilters) {
  if (includeFilters) {
    const {
      includedChatIds,
      ...filters
    } = includeFilters;

    if (
      Object.values(filters).filter(Boolean).length > 1
      || (includedChatIds?.length)
    ) {
      return '';
    }

    if (filters.bots) {
      return 'Bots';
    } else if (filters.groups) {
      return 'Groups';
    } else if (filters.channels) {
      return 'Channels';
    } else if (filters.contacts) {
      return 'Contacts';
    } else if (filters.nonContacts) {
      return 'Non-Contacts';
    }
  }

  return '';
}

type FolderIncludeFilters = Pick<ApiChatFolder, (
  'includedChatIds' | 'bots' | 'channels' | 'groups' | 'contacts' | 'nonContacts'
)>;
type FolderExcludeFilters = Pick<ApiChatFolder, 'excludedChatIds' | 'excludeArchived' | 'excludeMuted' | 'excludeRead'>;

export type FoldersState = {
  mode: 'create' | 'edit';
  isLoading?: boolean;
  isTouched?: boolean;
  error?: string;
  folderId?: number;
  chatFilter: string;
  folder: Omit<ApiChatFolder, 'id' | 'description'>;
  includeFilters?: FolderIncludeFilters;
  excludeFilters?: FolderExcludeFilters;
};
export type FoldersActions = (
  'setTitle' | 'saveFilters' | 'editFolder' | 'reset' | 'setChatFilter' | 'setIsLoading' | 'setError' |
  'editIncludeFilters' | 'editExcludeFilters' | 'setIncludeFilters' | 'setExcludeFilters' | 'setIsTouched' |
  'setFolderId' | 'setIsChatlist' | 'setEmoticon' | 'setEmoji' |'setCustomEmoji'
  );
export type FolderEditDispatch = Dispatch<FoldersState, FoldersActions>;

const INITIAL_STATE: FoldersState = {
  mode: 'create',
  chatFilter: '',
  folder: {
    title: { text: '' },
    includedChatIds: [],
    excludedChatIds: [],
  },
};

export function getEmojiPrefix(text: string, entities: ApiMessageEntity[]) {
  if (entities?.length && entities[0].type === 'MessageEntityCustomEmoji' && entities[0].offset === 0) {
    return text.slice(entities[0].length + 1);
  }
  EMOJI_REGEX.lastIndex = 0;
  const match = EMOJI_REGEX.exec(text);
  if (match && match.index === 0) {
    return match[0] + ' ';
  }
  return '';
}

export function removeEmojiPrefix(text: string, entities: ApiMessageEntity[]) {
  if (entities?.length && entities[0].type === 'MessageEntityCustomEmoji' && entities[0].offset === 0) {
    return text.slice(entities[0].length + 1);
  }
  EMOJI_REGEX.lastIndex = 0;
  const match = EMOJI_REGEX.exec(text);
  if (match && match.index === 0) {
    return text.slice(match[0].length + 1);
  }
  return text;
}

const foldersReducer: StateReducer<FoldersState, FoldersActions> = (
  state,
  action,
): FoldersState => {
  switch (action.type) {
    case 'setTitle': {
      const prefix = getEmojiPrefix(state.folder.title.text, state.folder.title.entities || []);
      return {
        ...state,
        folder: {
          ...state.folder,
          title: {
            ...state.folder.title,
            text: prefix + action.payload,
          },
        },
        isTouched: true,
      };
    }
    case 'setEmoticon': {
      const text = removeEmojiPrefix(state.folder.title.text, state.folder.title.entities || []);
      return {
        ...state,
        folder: {
          ...state.folder,
          title: {
            text,
            entities: [],
          },
          emoticon: action.payload,
        },
        isTouched: true,
      };
    }
    case 'setEmoji': {
      const emoji = action.payload;
      const text = removeEmojiPrefix(state.folder.title.text, state.folder.title.entities || []);
      return {
        ...state,
        folder: {
          ...state.folder,
          title: {
            text: emoji + ' ' + text,
            entities: [],
          },
          emoticon: '',
        },
        isTouched: true,
      };
    }
    case 'setCustomEmoji': {
      const emoji: ApiSticker = action.payload;
      let text = state.folder.title.text;
      if (state.folder.title.entities?.length &&
        state.folder.title.entities[0].type === 'MessageEntityCustomEmoji' &&
        state.folder.title.entities[0].offset === 0) {
        text = state.folder.title.text.slice(state.folder.title.entities[0].length + 1);
      }
      return {
        ...state,
        folder: {
          ...state.folder,
          title: {
            text: emoji.emoji + ' ' + text,
            entities: [{
              type: 'MessageEntityCustomEmoji',
              offset: 0,
              length: (emoji.emoji || '').length,
              documentId: emoji.id,
            } as ApiMessageEntity],
          },
          emoticon: '',
        },
        isTouched: true,
      };
    }
    case 'setFolderId':
      return {
        ...state,
        folderId: action.payload,
        mode: 'edit',
      };
    case 'editIncludeFilters':
      return {
        ...state,
        includeFilters: pick(
          state.folder,
          INCLUDE_FILTER_FIELDS,
        ),
      };
    case 'editExcludeFilters':
      return {
        ...state,
        excludeFilters: pick(
          state.folder,
          EXCLUDE_FILTER_FIELDS,
        ),
      };
    case 'setIncludeFilters':
      return {
        ...state,
        includeFilters: action.payload,
        chatFilter: '',
      };
    case 'setExcludeFilters':
      return {
        ...state,
        excludeFilters: action.payload,
        chatFilter: '',
      };
    case 'saveFilters':
      if (state.includeFilters) {
        return {
          ...state,
          folder: {
            ...omit(state.folder, INCLUDE_FILTER_FIELDS),
            title: state.folder.title ? state.folder.title : { text: getSuggestedFolderName(state.includeFilters) },
            ...state.includeFilters,
          },
          includeFilters: undefined,
          chatFilter: '',
          isTouched: true,
        };
      } else if (state.excludeFilters) {
        return {
          ...state,
          folder: {
            ...omit(state.folder, EXCLUDE_FILTER_FIELDS),
            ...state.excludeFilters,
          },
          excludeFilters: undefined,
          chatFilter: '',
          isTouched: true,
        };
      } else {
        return state;
      }
    case 'editFolder': {
      const { id: folderId, description, ...folder } = action.payload;

      return {
        mode: 'edit',
        folderId,
        folder,
        chatFilter: '',
      };
    }
    case 'setChatFilter': {
      return {
        ...state,
        chatFilter: action.payload,
      };
    }
    case 'setIsTouched': {
      return {
        ...state,
        isTouched: action.payload,
      };
    }
    case 'setIsLoading': {
      return {
        ...state,
        isLoading: action.payload,
      };
    }
    case 'setError': {
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };
    }
    case 'setIsChatlist':
      return {
        ...state,
        folder: {
          ...state.folder,
          isChatList: action.payload,
        },
      };
    case 'reset':
      return INITIAL_STATE;
    default:
      return state;
  }
};

const useFoldersReducer = () => {
  return useReducer(foldersReducer, INITIAL_STATE);
};

export default useFoldersReducer;
