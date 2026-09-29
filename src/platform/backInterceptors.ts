// Sub-views that live inside a tab (a Shop Box or Structure Deck page) own their own Back step.
// The newest registered interceptor handles Android Back before App falls back to "go Home".

type Interceptor = () => void;

const stack: Interceptor[] = [];

/** Register a Back step for a mounted sub-view. Returns the unregister function (use it as an effect cleanup). */
export function pushBackInterceptor(onBack: Interceptor): () => void {
  stack.push(onBack);
  return () => {
    const i = stack.lastIndexOf(onBack);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Run the newest interceptor, if any. Returns true when Back was handled. */
export function runBackInterceptor(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}
