export interface UrlBarControllerOptions {
  currentUrl: string;
  onApplyUrl?: (nextUrl: string) => boolean | Promise<boolean>;
}

export interface UrlBarController {
  element: HTMLDivElement;
  inputEl: HTMLInputElement;
  isEditing: () => boolean;
  commitIfDirty: () => Promise<boolean>;
}

export function createUrlBarController(options: UrlBarControllerOptions): UrlBarController {
  const element = document.createElement('div');
  element.className = 'nbe-urlbar';
  element.classList.add('is-view');

  const inputEl = document.createElement('input');
  inputEl.className = 'nbe-url-input';
  inputEl.type = 'text';
  inputEl.value = options.currentUrl;
  inputEl.spellcheck = false;
  inputEl.autocomplete = 'off';
  element.appendChild(inputEl);

  const canApply = Boolean(options.onApplyUrl);
  let isEditing = false;
  let isApplying = false;
  let lastCommittedUrl = options.currentUrl;

  const collapseSelection = () => {
    const cursor = inputEl.value.length;
    inputEl.setSelectionRange(cursor, cursor);
  };

  const setEditingState = (editing: boolean, selectAll = false) => {
    isEditing = editing && canApply;
    inputEl.readOnly = !isEditing;
    element.classList.toggle('is-editing', isEditing);
    element.classList.toggle('is-view', !isEditing);
    if (selectAll && isEditing) {
      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.select();
        const end = inputEl.value.length;
        inputEl.setSelectionRange(0, end);
      });
    }
  };

  const commitIfDirty = async (): Promise<boolean> => {
    if (!canApply) return true;
    if (isApplying) return false;

    const nextValue = inputEl.value;
    if (nextValue === lastCommittedUrl) {
      setEditingState(false);
      collapseSelection();
      return true;
    }

    isApplying = true;
    element.classList.add('is-applying');
    try {
      const applied = await options.onApplyUrl?.(nextValue);
      if (applied === false) {
        setEditingState(true, true);
        return false;
      }
      lastCommittedUrl = nextValue;
      setEditingState(false);
      collapseSelection();
      return true;
    } catch {
      setEditingState(true, true);
      return false;
    } finally {
      isApplying = false;
      element.classList.remove('is-applying');
    }
  };

  setEditingState(false);

  if (canApply) {
    const enterEditing = () => {
      if (isEditing || isApplying) return;
      setEditingState(true, true);
    };

    element.addEventListener('mousedown', (event) => {
      if (event.target === inputEl || inputEl.contains(event.target as Node)) return;
      event.preventDefault();
      enterEditing();
    });

    inputEl.addEventListener('focus', () => {
      enterEditing();
    });

    inputEl.addEventListener('blur', () => {
      collapseSelection();
      if (!isEditing) return;
      void commitIfDirty();
    });

    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        void commitIfDirty();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        inputEl.value = lastCommittedUrl;
        setEditingState(false);
        inputEl.blur();
      }
    });
  }

  return {
    element,
    inputEl,
    isEditing: () => isEditing,
    commitIfDirty,
  };
}
