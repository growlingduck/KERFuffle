import { Sheet } from '../components/Sheet';
import { ViewTitle } from '../components/ViewTitle';
import { routeHref } from '../routes';
import styles from './Screen.module.css';

/** Shown when a job route names a job that doesn't exist. */
export function MissingJob({ jobId }: { jobId: string }) {
  return (
    <div className={styles.page}>
      <Sheet aria-labelledby="missing-h">
        <ViewTitle id="missing-h" level={1} title="Job not found" sub={jobId} />
        <div className={styles.placeholder}>
          <p>There is no job with this id. It may have been removed.</p>
          <a href={routeHref({ name: 'jobs' })}>Back to Jobs</a>
        </div>
      </Sheet>
    </div>
  );
}
