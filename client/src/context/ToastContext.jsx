import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Toaster from '../components/Toaster.jsx';

const ToastContext = createContext(null);

let nextId = 0;

/**
 * Six pages each kept their own `error` state and rendered their own alert
 * paragraph for it, which meant a failed action scrolled out of view and a
 * successful one said nothing at all.
 *
 * Form-level validation stays inline next to the field it belongs to. What
 * comes through here is the outcome of an action - applied, withdrawn,
 * approved - where the result needs to be announced, not anchored.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone, message) => {
    if (!message) return;
    const id = (nextId += 1);
    setToasts((list) => [...list, { id, tone, message: String(message) }]);
  }, []);

  const value = useMemo(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('danger', m),
      info: (m) => push('info', m),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}
