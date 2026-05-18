import { Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProcessStore } from '../../store/processStore';

function ProcessInspector() {
  const { t } = useTranslation();
  const logs = useProcessStore((state) => state.logs);
  const setOpen = useProcessStore((state) => state.setOpen);
  const clearLogs = useProcessStore((state) => state.clearLogs);

  return (
    <aside className="process-drawer" aria-label={t('process.title')}>
      <div className="process-header">
        <div>
          <h2 className="section-title">{t('process.title')}</h2>
          <p>{t('process.subtitle')}</p>
        </div>
        <div className="toolbar">
          <button className="icon-button" type="button" title={t('process.clear')} onClick={clearLogs}>
            <Trash2 size={16} />
          </button>
          <button className="icon-button" type="button" title={t('process.close')} onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="process-list">
        {logs.length === 0 && <div className="empty-state">{t('process.empty')}</div>}
        {logs.map((log) => (
          <article className={`process-log ${log.level}`} key={log.id}>
            <div className="process-log-meta">
              <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span>{log.stage}</span>
              <span>{t(`process.level.${log.level}`)}</span>
            </div>
            <strong>{log.title}</strong>
            {log.detail && <p>{log.detail}</p>}
            {log.data && (
              <pre>
                {JSON.stringify(log.data, null, 2)}
              </pre>
            )}
          </article>
        ))}
      </div>
    </aside>
  );
}

export default ProcessInspector;
