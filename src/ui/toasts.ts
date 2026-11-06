import { setIcon } from "obsidian";

export interface ToastOptions {
  icon: string;
  heading: string;
  title: string;
  description?: string;
  reward?: string;
  /** css modifier, e.g. rarity name, "level", "quest" */
  variant: string;
}

/** Stack of modern slide-in cards in the lower right corner. */
export class Toasts {
  private host: HTMLElement;

  constructor() {
    this.host = document.body.createDiv({ cls: "vq-toasts" });
  }

  show(opts: ToastOptions, duration = 5000): void {
    const el = this.host.createDiv({ cls: `vq-toast vq-variant-${opts.variant}` });
    const icon = el.createDiv({ cls: "vq-toast-icon" });
    setIcon(icon, opts.icon);
    const body = el.createDiv({ cls: "vq-toast-body" });
    body.createDiv({ cls: "vq-toast-heading", text: opts.heading });
    body.createDiv({ cls: "vq-toast-title", text: opts.title });
    if (opts.description) body.createDiv({ cls: "vq-toast-desc", text: opts.description });
    if (opts.reward) el.createDiv({ cls: "vq-toast-reward", text: opts.reward });

    const close = () => {
      el.addClass("is-leaving");
      window.setTimeout(() => el.remove(), 350);
    };
    el.addEventListener("click", close);
    window.setTimeout(close, duration);

    // keep the stack short
    const all = this.host.querySelectorAll(".vq-toast:not(.is-leaving)");
    if (all.length > 4) (all[0] as HTMLElement).click();
  }

  destroy(): void {
    this.host.remove();
  }
}
