'use strict';
/* Shared, touch-friendly backdrop dismissal for native <dialog> windows.
   No order, inventory or Etsy action is run when a window is dismissed. */
(() => {
  const dialogsWithEdits = new Set([
    'settings', 'local-order-dialog', 'quantity', 'filament-editor',
    'components-editor', 'master-editor', 'printer-config-dialog'
  ]);
  const stateByDialog = new WeakMap();

  const outside = (event, dialog) => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  };

  const saving = dialog => (
    (dialog.id === 'local-order-dialog' && typeof localSaving !== 'undefined' && localSaving) ||
    (['filament-editor', 'filament-rolls'].includes(dialog.id) && typeof filamentBusy !== 'undefined' && filamentBusy) ||
    (dialog.id === 'printer-config-dialog' && typeof printerConfigBusy !== 'undefined' && printerConfigBusy) ||
    (dialog.id === 'master-editor' && typeof masterBusy !== 'undefined' && masterBusy) ||
    (['quantity', 'components-editor', 'order-details'].includes(dialog.id) && typeof busy !== 'undefined' && busy)
  );

  function closeDialog(dialog) {
    if (!dialog?.open) return false;
    if (saving(dialog)) return false;
    const state = stateByDialog.get(dialog);
    if (dialogsWithEdits.has(dialog.id) && state?.dirty &&
        !window.confirm('Du hast Änderungen vorgenommen, die noch nicht gespeichert sind. Fenster trotzdem schließen und Änderungen verwerfen?')) {
      return false;
    }
    dialog.close();
    return true;
  }
  window.closeDruckplanerDialog = closeDialog;

  for (const dialog of document.querySelectorAll('dialog')) {
    const state = {dirty: false, backdropStart: false};
    stateByDialog.set(dialog, state);

    // Opening a fresh dialog begins a fresh edit session. Successful saves
    // can still close programmatically without a discard confirmation.
    new MutationObserver(() => {
      state.dirty = false;
      state.backdropStart = false;
    }).observe(dialog, {attributes: true, attributeFilter: ['open']});

    const markEdited = event => {
      if (!dialogsWithEdits.has(dialog.id)) return;
      const field = event.target;
      if (!field.matches?.('input,textarea,select,[contenteditable]')) return;
      if (field.matches('input[type="hidden"],input[type="submit"],input[type="button"]')) return;
      // Choosing a printer/profile or source type only changes what is viewed.
      if (dialog.id === 'master-editor' &&
          ['master-printer', 'master-variant', 'master-source-type'].includes(field.id)) return;
      state.dirty = true;
    };
    dialog.addEventListener('input', markEdited);
    dialog.addEventListener('change', markEdited);
    dialog.addEventListener('click', event => {
      if (dialogsWithEdits.has(dialog.id) &&
          event.target.closest?.('#local-add-line,[data-local-remove],[data-local-choose],#master-add,[data-master-remove]')) {
        state.dirty = true;
      }
      // The ::backdrop delivers a click whose target is the dialog itself.
      // Check coordinates so a click on dialog padding never dismisses it.
      if (dialog.open && event.target === dialog && outside(event, dialog) && state.backdropStart) {
        event.preventDefault();
        closeDialog(dialog);
      }
      state.backdropStart = false;
    });

    // Require the press to START on the backdrop too: dragging or scrolling
    // from within a long dialog must not accidentally close the window.
    dialog.addEventListener('pointerdown', event => {
      state.backdropStart = event.target === dialog && outside(event, dialog);
    });
    dialog.addEventListener('pointercancel', () => { state.backdropStart = false; });

    // Prevent the browser's native Escape dismissal bypassing the dirty guard.
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeDialog(dialog);
    });
  }

  // Existing X and Abbrechen buttons use data-close. Capture before their
  // legacy direct .close() handlers to apply the same unsaved-edit protection.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-close]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    closeDialog(document.getElementById(button.dataset.close));
  }, true);
})();
