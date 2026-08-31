"use client";

import type { DefaultReactSuggestionItem, SuggestionMenuProps } from "@blocknote/react";
import { LoaderCircle } from "lucide-react";

export function SeekSlashMenu({ items, loadingState, selectedIndex, onItemClick }: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  return (
    <div className="seek-slash-menu" role="listbox" aria-label="插入内容">
      {loadingState !== "loaded" && (
        <div className="seek-slash-menu__loading"><LoaderCircle size={16} className="animate-spin" />正在加载</div>
      )}
      {items.map((item, index) => {
        const showGroup = item.group !== items[index - 1]?.group;
        return (
          <div key={`${item.group ?? "item"}-${item.title}`}>
            {showGroup && item.group && <div className="seek-slash-menu__group">{item.group}</div>}
            <button
              type="button"
              role="option"
              aria-selected={selectedIndex === index}
              className="seek-slash-menu__item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onItemClick?.(item)}
            >
              <span className="seek-slash-menu__icon">{item.icon}</span>
              <span className="seek-slash-menu__copy">
                <span className="seek-slash-menu__title">{item.title}</span>
                {item.subtext && <span className="seek-slash-menu__description">{item.subtext}</span>}
              </span>
              {item.badge && <kbd className="seek-slash-menu__badge">{item.badge}</kbd>}
            </button>
          </div>
        );
      })}
      {loadingState === "loaded" && items.length === 0 && <div className="seek-slash-menu__empty">没有匹配的内容块</div>}
    </div>
  );
}
