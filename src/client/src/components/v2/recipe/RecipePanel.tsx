import type { EditRecipe, V2TaskId } from '../../../../../shared/types';
import PortraitPanel from './PortraitPanel';
import ColorPanel from './ColorPanel';
import CleanupPanel from './CleanupPanel';
import LocalPanel from './LocalPanel';
import ExportPanel from './ExportPanel';
import ProjectPanel from './ProjectPanel';

interface RecipePanelProps {
  recipe: EditRecipe;
  onChange: (next: EditRecipe) => void;
  disabled?: boolean;
}

/**
 * Recipe 面板调度器：根据 `recipe.taskId` 渲染对应任务面板。
 *
 * 每个任务面板都接收统一的 `{ recipe, onChange, disabled }` 接口。
 * 切换任务时，父组件（AppV2）会传入对应 taskId 的 Recipe 实例，
 * 因此本调度器只做静态分派，不持有任何状态。
 */
const PANELS: Record<V2TaskId, React.ComponentType<RecipePanelProps>> = {
  project: ProjectPanel,
  subject: PortraitPanel,
  color: ColorPanel,
  cleanup: CleanupPanel,
  local: LocalPanel,
  export: ExportPanel,
};

export default function RecipePanel(props: RecipePanelProps) {
  const Panel = PANELS[props.recipe.taskId];
  return <Panel {...props} />;
}
