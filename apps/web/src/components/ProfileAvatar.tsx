import { useState } from "react";

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
  const initials = name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

  return (
    <div className={className}>
      {src && failedSrc !== src ? (
        <img src={src} alt="" className={imageClassName} onError={() => setFailedSrc(src)} />
      ) : (
        <span className={fallbackClassName}>{initials}</span>
      )}
    </div>
  );
}
