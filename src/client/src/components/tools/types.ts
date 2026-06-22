import type { Dispatch } from 'react';
import type { EditorState, EditorAction, RetouchTool, ReferenceImage, Region } from '../../../../shared/types';

export interface ToolPanelProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onSubmit: (prompt: string, options?: {
    tool?: RetouchTool;
    params?: Record<string, unknown>;
    regions?: Region[];
    referenceImages?: ReferenceImage[];
  }) => void;
  externalPrompt?: string;
  onPromptConsumed?: () => void;
}
