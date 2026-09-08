import type { DeleteAccountBody } from '@legacy/contracts';

import { labels } from '../labels';
import { ApiError, errorMessage } from './items-api';

// The two rights of US-13, seen from the browser.
//
// The export comes back as a Blob rather than as a parsed object: the page does
// not read this document, it hands it to the person who asked for it. Parsing
// it here would mean re-serialising it afterwards, and the file saved would no
// longer be byte for byte the one the API served.
export interface AccountApi {
    exportPersonalData: () => Promise<Blob>;
    deleteAccount: (body: DeleteAccountBody) => Promise<void>;
}

export const accountApi: AccountApi = {
    async exportPersonalData() {
        const response = await fetch('/auth/me/export', {
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new ApiError(response.status, await errorMessage(response, labels.exportFailed));
        }

        return response.blob();
    },

    async deleteAccount(body) {
        const response = await fetch('/auth/me', {
            method: 'DELETE',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new ApiError(
                response.status,
                await errorMessage(response, labels.deleteAccountFailed),
            );
        }
    },
};
