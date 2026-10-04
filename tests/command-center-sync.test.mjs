import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createContractorSyncService,
  publicProfileForCommandCenter
} from '../lib/command-center-sync.mjs';

test(
  'command-center contractor export uses an explicit profile allowlist',
  () => {
    const profile =
      publicProfileForCommandCenter({
        id:
          '11111111-1111-4111-8111-111111111111',

        company:
          'Synthetic Contractor',

        contact:
          'Synthetic Contact',

        email:
          'synthetic@example.invalid',

        trade:
          'cleaning',

        state:
          'FL',

        internalSecret:
          'MUST_NOT_EXPORT',

        verification: {
          private:
            true
        },

        taxDocument:
          'MUST_NOT_EXPORT'
      });

    assert.equal(
      profile.company,
      'Synthetic Contractor'
    );

    assert.equal(
      'internalSecret' in profile,
      false
    );

    assert.equal(
      'verification' in profile,
      false
    );

    assert.equal(
      'taxDocument' in profile,
      false
    );
  }
);

test(
  'contractor sync pages through private profiles and performs no mutation',
  async () => {
    const pages = [
      {
        records: [
          {
            id:
              '11111111-1111-4111-8111-111111111111',

            company:
              'Synthetic A',

            trade:
              'cleaning',

            state:
              'FL'
          }
        ],

        cursor:
          'next',

        hasMore:
          true
      },
      {
        records: [
          {
            id:
              '22222222-2222-4222-8222-222222222222',

            company:
              'Synthetic B',

            trade:
              'landscaping',

            state:
              'FL'
          }
        ],

        cursor:
          null,

        hasMore:
          false
      }
    ];

    let calls =
      0;

    const service =
      createContractorSyncService({
        async pageProfiles(
          cursor
        ) {
          assert.equal(
            cursor,
            calls === 0
              ? null
              : 'next'
          );

          return pages[
            calls++
          ];
        }
      });

    const result =
      await service.list();

    assert.equal(
      result.profiles.length,
      2
    );

    assert.equal(
      result.externalMutationPerformed,
      false
    );

    assert.equal(
      result.contractorVerificationPerformed,
      false
    );
  }
);
