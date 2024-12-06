import { Steps } from '@ballerine/web-ui-sdk/dist/lib/contexts/configuration';

export const ballerineInitConfig = {
  endUserInfo: {
    id: 'test-id',
  },
  backendConfig: {
    baseUrl: 'http://localhost:3000',
  },
  uiConfig: {
    uiPack: 'default',
    //uiPack: 'future',
    general: {
      colors: {
        /*Change the primary color to "#6236FF", click Run, and see the how the theme changes */
        primary: '#6236FF',
        // primary: "#007AFF",
        //primary: "#000FFF",
      },
      fonts: {
        /*Change the font name to "Courier New", click Run, and see the how the font changes */
        name: 'Inter',
        link: 'https://fonts.googleapis.com/css2?family=Inter:wght@500',
        weight: [500, 700],
      },
    },
    flows: {
      ['my-kyc-flow']: {
        steps: [
          {
            name: 'welcome',
            id: 'welcome',
          },
          {
            name: 'document-selection',
            id: 'document-selection',
            documentOptions: [
              {
                type: 'id_card',
                kind: 'id_card',
              },
              {
                type: 'drivers_license',
                kind: 'drivers_license',
              },
              {
                type: 'passport',
                kind: 'passport',
              },
              {
                type: 'voter_id',
                kind: 'voter_id',
              },
            ],
          },
          {
            name: 'document-photo',
            id: 'document-photo',
          },
          {
            name: 'check-document',
            id: 'check-document',
          },
          {
            name: 'document-photo-back-start',
            id: 'document-photo-back-start',
          },
          {
            name: 'document-photo-back',
            id: 'document-photo-back',
          },
          {
            name: 'selfie-start',
            id: 'selfie-start',
          },
          {
            name: 'selfie',
            id: 'selfie',
          },
          {
            name: 'check-selfie',
            id: 'check-selfie',
          },
          {
            name: 'loading',
            id: 'loading',
          },
          {
            name: 'final',
            id: 'final',
          },
        ],
      },
    },
  },
};
