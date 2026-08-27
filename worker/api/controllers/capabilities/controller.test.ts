import { describe, it, expect } from 'vitest';
import { CapabilitiesController } from './controller';
import type { RouteContext } from '../../types/route-context';
import { DEFAULT_FEATURE_DEFINITIONS } from '../../../agents/core/features';

const testEnv = {
	PLATFORM_CAPABILITIES: {
		features: {
			app: { enabled: true },
			presentation: { enabled: false },
			general: { enabled: true },
		},
		version: '1.0.0',
	},
	ENABLE_USER_ACCOUNT_DEPLOY: 'false',
	ENABLE_ARTIFACTS: 'true',
} as unknown as Env;

function makeContext(): RouteContext {
	return {
		user: null,
		sessionId: undefined,
		config: {},
		pathParams: {},
		queryParams: new URLSearchParams(),
	} as unknown as RouteContext;
}

describe('CapabilitiesController.getCapabilities', () => {
	it('exposes the General project type when PLATFORM_CAPABILITIES enables it', async () => {
		const response = await CapabilitiesController.getCapabilities(
			new Request('https://app.local/api/capabilities'),
			testEnv,
			{} as ExecutionContext,
			makeContext(),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			success: boolean;
			data: {
				features: Array<{ id: string; enabled: boolean }>;
				version: string;
				artifacts: boolean;
				userAccountDeploy: boolean;
			};
		};

		expect(body.success).toBe(true);
		expect(body.data.version).toBe('1.0.0');
		expect(body.data.artifacts).toBe(true);
		expect(body.data.userAccountDeploy).toBe(false);

		const general = body.data.features.find((feature) => feature.id === 'general');
		expect(general).toEqual({
			...DEFAULT_FEATURE_DEFINITIONS.general,
			enabled: true,
		});

		const presentation = body.data.features.find((feature) => feature.id === 'presentation');
		expect(presentation?.enabled).toBe(false);
	});
});
