import { useEffect } from 'react';
import { landingConfigSchema } from '@shared/schemas';
import { useAppDispatch, useAppSelector } from '~/store/hooks';
import { selectEditMode, toggleEditMode } from '~/store/slices/authSlice';
import { initBuilderSession, selectHeroSlide } from '~/store/slices/builderSlice';

// La vista aislada conserva los breakpoints reales, incluido el ancho móvil.
export function LandingPreviewBridge() {
  const dispatch = useAppDispatch();
  const editing = useAppSelector(selectEditMode);
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
      if (!editing) dispatch(toggleEditMode());
    }
    window.addEventListener('message', receive);
    function select(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const area = event.target.closest<HTMLElement>('[data-landing-section]');
      if (!interactive && area) {
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({ type: 'gyro:select-section', section: area.dataset.landingSection }, window.location.origin);
      } else if (event.target.closest('a, button')) {
        // La vista previa permanece en la portada y no realiza compras ni abre enlaces.
        event.preventDefault();
        event.stopPropagation();
      }
    }
    document.addEventListener('click', select, true);
    window.parent.postMessage({ type: 'gyro:preview-ready' }, window.location.origin);
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('click', select, true);
      delete document.documentElement.dataset.landingPreview;
    };
  }, [dispatch, editing]);
  return null;
}
