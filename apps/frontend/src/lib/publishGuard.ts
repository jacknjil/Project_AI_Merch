export type PublishBlockReason = 'asset-not-approved' | 'publishing-disabled';

export type PublishDecision =
  | { publish: true }
  | { publish: false; reason: PublishBlockReason };

export interface PublishCandidate {
  approvedForPublish?: boolean;
}

/**
 * Decides whether a Printify product may be pushed to the connected sales
 * channel (Etsy). Both gates must pass: the design is explicitly approved in
 * Firestore, and the PRINTIFY_PUBLISH_ENABLED master switch is exactly "true".
 * Anything else leaves the product as a hidden Printify draft.
 */
export function shouldPublishToChannel(
  asset: PublishCandidate,
  publishEnabledEnv: string | undefined,
): PublishDecision {
  if (asset.approvedForPublish !== true) {
    return { publish: false, reason: 'asset-not-approved' };
  }
  if (publishEnabledEnv !== 'true') {
    return { publish: false, reason: 'publishing-disabled' };
  }
  return { publish: true };
}
