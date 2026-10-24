import React from "react";

export interface MentionTextProps {
  content: string;
  className?: string;
}

/**
 * Text component that renders @mentions with stylish, highlighted badges.
 */
export const MentionText: React.FC<MentionTextProps> = ({ content, className }) => {
  if (!content) return null;

  // Split by @username tokens
  const parts = content.split(/(@[a-zA-Z0-9_\u0600-\u06FF.-]+)/g);

  return (
    <p className={className}>
      {parts.map((part, index) => {
        if (part.startsWith("@") && part.length > 1) {
          const username = part.slice(1);
          return (
            <span
              key={index}
              className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary transition hover:bg-primary/20 cursor-default select-text"
              title={`@${username}`}
            >
              @{username}
            </span>
          );
        }
        return part;
      })}
    </p>
  );
};
