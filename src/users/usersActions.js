/* @flow strict-local */
import * as typing_status from '@zulip/shared/js/typing_status';

import type { Auth, GlobalState, Narrow, UserId, ThunkAction } from '../types';
import * as api from '../api';
import { PRESENCE_RESPONSE } from '../actionConstants';
import { getAuth, getServerVersion } from '../selectors';
import { isPmNarrow, userIdsOfPmNarrow } from '../utils/narrow';
import { getUserForId } from './userSelectors';
import { ZulipVersion } from '../utils/zulipVersion';

export const reportPresence = (isActive: boolean): ThunkAction<Promise<void>> => async (
  dispatch,
  getState,
) => {
  const newUserInput = false; // TODO Why this value?  Maybe it's the right one... but why?

  const auth = getAuth(getState());
  const response = await api.reportPresence(auth, isActive, newUserInput);
  dispatch({
    type: PRESENCE_RESPONSE,
    presence: response.presences,
    serverTimestamp: response.server_timestamp,
  });
};

const typingWorker = (state: GlobalState) => {
  const auth: Auth = getAuth(state);
  const serverVersion: ZulipVersion | null = getServerVersion(state);

  // User ID arrays are only supported in server versions >= 2.0.0-rc1
  // (zulip/zulip@2f634f8c0). For versions before this, email arrays
  // are used. If current server version is undetermined, user ID
  // arrays are optimistically used.
  const useEmailArrays = !!serverVersion && !serverVersion.isAtLeast('2.0.0-rc1');

  const getRecipients = user_ids_array => {
    if (useEmailArrays) {
      return JSON.stringify(user_ids_array.map(userId => getUserForId(state, userId).email));
    }
    return JSON.stringify(user_ids_array);
  };

  return {
    get_current_time: () => new Date().getTime(),

    notify_server_start: (user_ids_array: $ReadOnlyArray<UserId>) => {
      api.typing(auth, getRecipients(user_ids_array), 'start');
    },

    notify_server_stop: (user_ids_array: $ReadOnlyArray<UserId>) => {
      api.typing(auth, getRecipients(user_ids_array), 'stop');
    },
  };
};

export const sendTypingStart = (narrow: Narrow): ThunkAction<Promise<void>> => async (
  dispatch,
  getState,
) => {
  if (!isPmNarrow(narrow)) {
    return;
  }

  const recipientIds = userIdsOfPmNarrow(narrow);
  typing_status.update(typingWorker(getState()), recipientIds);
};

// TODO call this on more than send: blur, navigate away,
//   delete all contents, etc.
export const sendTypingStop = (narrow: Narrow): ThunkAction<Promise<void>> => async (
  dispatch,
  getState,
) => {
  if (!isPmNarrow(narrow)) {
    return;
  }

  typing_status.update(typingWorker(getState()), null);
};
