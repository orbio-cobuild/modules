import type { OrbioProfile } from './session'

/**
 * Sample sign-in for previews (UX #11). Builder previews run on workspace URLs that are not registered redirect URIs
 * at Orbio, so real sign-in can't work there. With ORBIO_SAMPLE_SIGN_IN=1 (server env, preview builds only), the
 * sign-in button signs in as this sample person instead. The checker fails a production build that has it set.
 * A sample session can't call Orbio's API.
 */
export const SAMPLE_SESSION_PREFIX = 'sample-'

export const SAMPLE_PROFILE: OrbioProfile = {
  sub: 'sample-user-ada',
  name: 'Ada (sample)',
  preferredUsername: 'ada_sample',
  walletAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
}

export const sampleSignInEnabled = () => process.env.ORBIO_SAMPLE_SIGN_IN === '1'
export const isSampleSession = (sessionId: string) => sessionId.startsWith(SAMPLE_SESSION_PREFIX)
