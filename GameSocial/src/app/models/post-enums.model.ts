/**
 * Corresponds to Domain.Enums.PostType
 * Clip = 1, Devlog = 2, Screenshots = 3, Review = 4, Poll = 5
 *
 * Used for REQUEST construction (numeric string sent as a multipart form
 * field, e.g. formData.append('PostType', String(PostType.Clip))) — the
 * backend's default enum model binder accepts the numeric value there.
 * Responses instead carry the string member name (see PostTypeName in
 * post.model.ts) — this two-track split is deliberate, don't collapse it.
 */
export enum PostType {
  Clip = 1,
  Devlog = 2,
  Screenshots = 3,
  Review = 4,
  Poll = 5,
}

/**
 * Corresponds to Domain.Enums.PostMediaType
 * Video = 1, Photo = 2
 */
export enum PostMediaType {
  Video = 1,
  Photo = 2,
}

/**
 * Corresponds to Domain.Enums.PostPhotoType
 * Screenshot = 1, ConceptArt = 2
 */
export enum PostPhotoType {
  Screenshot = 1,
  ConceptArt = 2,
}

/**
 * Corresponds to Domain.Enums.PlayStatus
 * Finished = 1, StillPlaying = 2, Dropped = 3
 */
export enum PlayStatus {
  Finished = 1,
  StillPlaying = 2,
  Dropped = 3,
}

/**
 * Corresponds to Domain.Enums.PatchLineStatus
 * Shipped = 1, Fixed = 2, Investigating = 3
 *
 * Sent to the backend inside the PatchLinesJson form field's JSON body (NOT
 * as a plain form field), where the backend's JsonStringEnumConverter
 * expects the string member name — see PostComposer's use of the reverse
 * numeric-enum lookup (PatchLineStatus[value]) when building that JSON.
 */
export enum PatchLineStatus {
  Shipped = 1,
  Fixed = 2,
  Investigating = 3,
}
