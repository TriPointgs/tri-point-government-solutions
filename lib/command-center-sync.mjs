import {
  createHash
} from 'node:crypto';

import {
  HttpError
} from './model.mjs';

const MAX_PROFILES =
  5000;

function text(
  value,
  max = 2000
) {
  const result =
    String(
      value ?? ''
    ).trim();

  return result.slice(
    0,
    max
  );
}

function list(
  value,
  max = 50
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(
      0,
      max
    )
    .map(
      item =>
        text(
          item,
          200
        )
    )
    .filter(Boolean);
}

export function publicProfileForCommandCenter(
  profile
) {
  return {
    id:
      text(
        profile.id,
        100
      ),

    company:
      text(
        profile.company,
        200
      ),

    contact:
      text(
        profile.contact,
        200
      ),

    email:
      text(
        profile.email,
        320
      ),

    trade:
      text(
        profile.trade,
        120
      ),

    additionalServices:
      list(
        profile.additionalServices,
        20
      ),

    state:
      text(
        profile.state,
        2
      ).toUpperCase(),

    serviceCounties:
      list(
        profile.serviceCounties,
        30
      ),

    statewide:
      profile.statewide === true,

    travelRadius:
      Number.isFinite(
        Number(
          profile.travelRadius
        )
      )
        ? Number(
            profile.travelRadius
          )
        : null,

    crewSize:
      Number.isFinite(
        Number(
          profile.crewSize
        )
      )
        ? Number(
            profile.crewSize
          )
        : null,

    maxProject:
      Number.isFinite(
        Number(
          profile.maxProject
        )
      )
        ? Number(
            profile.maxProject
          )
        : null,

    yearsInBusiness:
      Number.isFinite(
        Number(
          profile.yearsInBusiness
        )
      )
        ? Number(
            profile.yearsInBusiness
          )
        : null,

    experience:
      list(
        profile.experience,
        10
      ),

    licensed:
      text(
        profile.licensed,
        40
      ),

    insured:
      text(
        profile.insured,
        40
      ),

    workersComp:
      text(
        profile.workersComp,
        40
      ),

    sam:
      text(
        profile.sam,
        40
      ),

    availability:
      text(
        profile.availability,
        300
      ),

    certifications:
      text(
        profile.certifications,
        500
      ),

    equipment:
      text(
        profile.equipment,
        1500
      ),

    consent:
      profile.consent === true,

    submittedAt:
      text(
        profile.submittedAt,
        100
      ),

    updatedAt:
      text(
        profile.updatedAt,
        100
      )
  };
}

export function createContractorSyncService(
  store
) {
  if (
    !store ||
    typeof store.pageProfiles !==
      'function'
  ) {
    throw new Error(
      'Contractor profile store is required.'
    );
  }

  return {
    async list() {
      const profiles = [];

      let cursor =
        null;

      do {
        const page =
          await store.pageProfiles(
            cursor
          );

        for (
          const profile of
          page.records ||
          []
        ) {
          profiles.push(
            publicProfileForCommandCenter(
              profile
            )
          );

          if (
            profiles.length >
            MAX_PROFILES
          ) {
            throw new HttpError(
              503,
              'Private contractor sync exceeded its bounded profile limit.'
            );
          }
        }

        cursor =
          page.hasMore
            ? page.cursor
            : null;
      }
      while (cursor);

      const revision =
        createHash(
          'sha256'
        )
          .update(
            JSON.stringify(
              profiles.map(
                profile => [
                  profile.id,
                  profile.updatedAt ||
                  profile.submittedAt
                ]
              )
            )
          )
          .digest(
            'hex'
          );

      return {
        version:
          '5.0.0-dev.1',

        classification:
          'PRIVATE_COMMAND_CENTER_SYNC',

        revision,

        profiles,

        contractorVerificationPerformed:
          false,

        opportunityDataIncluded:
          false,

        otherContractorsDisclosedToContractors:
          false,

        externalMutationPerformed:
          false
      };
    }
  };
}
