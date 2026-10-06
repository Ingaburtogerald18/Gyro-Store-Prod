import { useEffect, useRef } from 'react';
import { landingConfigSchema } from '@shared/schemas';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectEditMode, toggleEditMode } from '~/store/slices/authSlice';
import { initBuilderSession, selectHeroSlide } from '~/store/slices/builderSlice';

// La vista aislada conserva los breakpoints reales, incluido el ancho móvil.
export function LandingPreviewBridge() {
  const dispatch = useAppDispatch();
  const editing = useAppSelector(selectEditMode);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    let interactive = false;
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent || window.parent === window) return;
      if (event.data?.type !== 'gyro:landing-preview') return;
      const parsed = landingConfigSchema.safeParse(event.data.config);
      if (!parsed.success) return;
      interactive = event.data.interactive === true;
      document.documentElement.dataset.landingPreview = interactive ? 'view' : 'edit';
      dispatch(initBuilderSession(parsed.data));
      dispatch(selectHeroSlide(typeof event.data.slideId === 'string' ? event.data.slideId : null));
      if (!editingRef.current) dispatch(toggleEditMode());
    }
    window.addEventListener('message', receive);
    function select(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const area = event.target.closest<HTMLElement>('[data-landing-section]');
      if (!interactive && area) {
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({ type: 'gyro:select-section', section: area.dataset.landingSection }, window.location.origin);
      } else if (interactive && event.target.closest('[data-preview-control]')) {
        return;
      } else if (event.target.closest('a, button, [role="link"], [role="button"]')) {
        const anchor = event.target.closest('a[href]');
        if (interactive && anchor) {
          const destination = new URL(anchor.getAttribute('href') || '', window.location.href);
          if (destination.origin === window.location.origin && destination.pathname === '/' && destination.hash) {
            event.preventDefault();
            event.stopPropagation();
            document.getElementById(decodeURIComponent(destination.hash.slice(1)))?.scrollIntoView({ block: 'start' });
            return;
          }
        }
        window.parent.postMessage({ type: 'gyro:preview-link' }, window.location.origin);
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function preventSubmit(event: SubmitEvent) { event.preventDefault(); event.stopPropagation(); }
    document.addEventListener('submit', preventSubmit, true);
    document.addEventListener('click', select, true);
    window.parent.postMessage({ type: 'gyro:preview-ready' }, window.location.origin);
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('click', select, true);
      document.removeEventListener('submit', preventSubmit, true);
      delete document.documentElement.dataset.landingPreview;
    };
  }, [dispatch]);
  return null;
}
