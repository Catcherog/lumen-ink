/**
 * PERSIST-001 Task 9 — VersionStrip.
 *
 * Bottom strip rendering every Version in the current ProjectSnapshot as an
 * ordinal chip. Behaviors (per plan spec):
 *  - One chip per Version, labeled with the Version's `label` (e.g. v0, v1).
 *  - Clicking a chip only VIEWS the Version (calls `onViewVersion`); it does
 *    NOT mutate the active pointer. The active pointer is changed exclusively
 *    by the explicit "设为当前" button.
 *  - The active Version carries `aria-current="true"`.
 *  - The viewed Version carries `data-viewed="true"` (distinct from active).
 *  - The approved Version carries `data-approved="true"`.
 *  - "设为当前" (Activate) and "锁定" (Approve) buttons appear only on the
 *    currently-viewed chip, so at most one of each is visible at a time.
 *  - Renders nothing when `snapshot` is null (no Project loaded).
 *
 * The strip does NOT fetch anything itself; all state and mutations flow in
 * via props from `useProject`.
 */

import { GitBranch, Check, Lock } from 'lucide-react';
import type { ProjectSnapshotDto } from '../../api/projects';

export interface VersionStripProps {
  snapshot: ProjectSnapshotDto | null;
  /** Currently viewed Version id, or null when nothing is being previewed. */
  viewedVersionId: string | null;
  /** View-only: user clicked a Version chip to preview its asset. */
  onViewVersion: (versionId: string) => void;
  /** Mutates the active pointer on the server. */
  onActivate: (versionId: string) => void;
  /** Mutates the approved pointer on the server. */
  onApprove: (versionId: string) => void;
}

export default function VersionStrip({
  snapshot,
  viewedVersionId,
  onViewVersion,
  onActivate,
  onApprove,
}: VersionStripProps) {
  if (!snapshot) return null;

  const { project, versions, activeVersion, approvedVersion } = snapshot;
  const activeId = activeVersion?.id ?? project.activeVersionId ?? null;
  const approvedId = approvedVersion?.id ?? project.approvedVersionId ?? null;

  return (
    <footer className="h-12 flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 overflow-x-auto">
      <GitBranch className="w-4 h-4 flex-shrink-0 text-gray-400" />
      <span className="font-medium text-gray-700 dark:text-gray-200 flex-shrink-0">
        {project.name}
      </span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
        {versions.map((v) => {
          const isActive = v.id === activeId;
          const isViewed = v.id === viewedVersionId;
          const isApproved = v.id === approvedId;
          return (
            <div key={v.id} className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => onViewVersion(v.id)}
                aria-current={isActive ? 'true' : 'false'}
                data-viewed={isViewed ? 'true' : 'false'}
                data-approved={isApproved ? 'true' : 'false'}
                className={[
                  'px-2 py-1 rounded-md border transition-colors flex items-center gap-1',
                  isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                  isViewed && !isActive
                    ? 'ring-1 ring-amber-400 dark:ring-amber-500'
                    : '',
                ].join(' ')}
                title={v.label}
              >
                <span>{v.label}</span>
                {isActive && <Check className="w-3 h-3" />}
                {isApproved && <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
              </button>
              {isViewed && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onActivate(v.id)}
                    disabled={isActive}
                    className={[
                      'px-1.5 py-0.5 rounded text-[10px] border transition-colors',
                      isActive
                        ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        : 'border-blue-400 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30',
                    ].join(' ')}
                  >
                    设为当前
                  </button>
                  <button
                    type="button"
                    onClick={() => onApprove(v.id)}
                    disabled={isApproved}
                    className={[
                      'px-1.5 py-0.5 rounded text-[10px] border transition-colors',
                      isApproved
                        ? 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        : 'border-emerald-500 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
                    ].join(' ')}
                  >
                    锁定
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </footer>
  );
}
