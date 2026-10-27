import { useState } from "react";
import { getApiUrl } from "../core/api/config";

function resolveAvatarUrl(src?: string | null): string | null {
  if (!src) return null;
  if (!src.startsWith('/media/') && !src.startsWith('/storage/') && !src.startsWith('avatars/')) {
    return src;
  }
  const apiOrigin = new URL(getApiUrl(), window.location.origin).origin;
  const path = src.startsWith('avatars/') ? `/media/${src}` : src;
  return new URL(path, apiOrigin).href;
}

interface ProfileAvatarProps {
  src?: string | null;
  name?: string | null;
  className: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export default function ProfileAvatar({
  src,
  name,
  className,
  imageClassName = "size-full object-cover",
  fallbackClassName = "flex size-full items-center justify-center rounded-full bg-primary/10 text-primary",
}: ProfileAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = resolveAvatarUrl(src);
  const initials = name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

  return (
    <div className={className}>
      {resolvedSrc && failedSrc !== resolvedSrc ? (
        <img src={resolvedSrc} alt="" className={imageClassName} onError={() => setFailedSrc(resolvedSrc)} />
      ) : (
        <span className={fallbackClassName}>{initials}</span>
      )}
    </div>
  );
}
