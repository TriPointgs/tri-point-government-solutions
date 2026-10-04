import {
  HttpError
} from '../lib/model.mjs';

import {
  equal,
  send,
  fail
} from '../lib/security.mjs';

import {
  opportunityStore
} from '../lib/opportunity-storage.mjs';

import {
  createContractorSyncService
} from '../lib/command-center-sync.mjs';

export function createHandler(
  service
) {
  return async function handler(
    req,
    res
  ) {
    try {
      if (
        req.method !== 'GET'
      ) {
        res.setHeader(
          'Allow',
          'GET'
        );

        throw new HttpError(
          405,
          'Method not allowed.'
        );
      }

      const configured =
        String(
          process.env
            .TP_COMMAND_CENTER_SYNC_TOKEN ||
          ''
        );

      if (
        configured.length < 32
      ) {
        throw new HttpError(
          503,
          'Command-center contractor sync is not configured.'
        );
      }

      const authorization =
        String(
          req.headers
            .authorization ||
          ''
        );

      const prefix =
        'Bearer ';

      if (
        !authorization.startsWith(
          prefix
        ) ||
        !equal(
          authorization.slice(
            prefix.length
          ),
          configured
        )
      ) {
        throw new HttpError(
          401,
          'Command-center sync authorization was not accepted.'
        );
      }

      return send(
        res,
        200,
        await service.list()
      );
    }
    catch (error) {
      return fail(
        res,
        error
      );
    }
  };
}

export default createHandler(
  createContractorSyncService(
    opportunityStore
  )
);
