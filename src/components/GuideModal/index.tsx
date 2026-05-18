import { ArrowLeft, ArrowRight, BookOpen, Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
}

type GuideMode = 'tutorial' | 'guide';

const tutorialStepKeys = ['import', 'metadata', 'preprocess', 'qda', 'quant', 'export'] as const;
const guideSectionKeys = ['corpus', 'preprocess', 'qda', 'quant', 'nlp', 'process', 'export'] as const;

function GuideModal({ onClose }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GuideMode>('tutorial');
  const [step, setStep] = useState(0);

  const currentStepKey = tutorialStepKeys[step];
  const isLastStep = step === tutorialStepKeys.length - 1;

  const guideSections = useMemo(
    () =>
      guideSectionKeys.map((key) => ({
        key,
        title: t(`guide.sections.${key}.title`),
        body: t(`guide.sections.${key}.body`),
        action: t(`guide.sections.${key}.action`),
      })),
    [t],
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal guide-modal" role="dialog" aria-modal="true" aria-label={t('guide.title')}>
        <div className="panel-header">
          <div className="guide-title">
            <BookOpen size={18} />
            <h2 className="section-title">{t('guide.title')}</h2>
          </div>
          <button className="icon-button" type="button" title={t('guide.close')} onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="guide-tabs" role="tablist" aria-label={t('guide.title')}>
          <button className={mode === 'tutorial' ? 'guide-tab active' : 'guide-tab'} type="button" onClick={() => setMode('tutorial')}>
            {t('guide.tutorialTab')}
          </button>
          <button className={mode === 'guide' ? 'guide-tab active' : 'guide-tab'} type="button" onClick={() => setMode('guide')}>
            {t('guide.guideTab')}
          </button>
        </div>

        {mode === 'tutorial' ? (
          <div className="guide-body">
            <div className="tutorial-progress" aria-label={t('guide.progress')}>
              {tutorialStepKeys.map((key, index) => (
                <button
                  className={index === step ? 'tutorial-dot active' : 'tutorial-dot'}
                  key={key}
                  type="button"
                  title={t(`guide.tutorial.${key}.title`)}
                  onClick={() => setStep(index)}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <section className="tutorial-card">
              <span className="muted">{t('guide.stepLabel', { current: step + 1, total: tutorialStepKeys.length })}</span>
              <h3>{t(`guide.tutorial.${currentStepKey}.title`)}</h3>
              <p>{t(`guide.tutorial.${currentStepKey}.body`)}</p>
              <div className="guide-note">{t(`guide.tutorial.${currentStepKey}.note`)}</div>
            </section>

            <div className="guide-actions">
              <button className="ghost-button" type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
                <ArrowLeft size={16} />
                {t('guide.previous')}
              </button>
              {isLastStep ? (
                <button className="primary-button" type="button" onClick={onClose}>
                  <Check size={16} />
                  {t('guide.finish')}
                </button>
              ) : (
                <button className="primary-button" type="button" onClick={() => setStep((value) => Math.min(tutorialStepKeys.length - 1, value + 1))}>
                  {t('guide.next')}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="guide-body guide-sections">
            {guideSections.map((section) => (
              <article className="guide-section" key={section.key}>
                <h3>{section.title}</h3>
                <p>{section.body}</p>
                <div className="guide-note">{section.action}</div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GuideModal;
