import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextPanel from './ContextPanel';
import { defaultRecipe, compilePrompt } from '../../utils/recipe';
import type { EditRecipe, EditorState } from '../../../../shared/types';

// ===== Mock 工具 =====

function makeState(overrides: Partial<EditorState> = {}): EditorState {
  return {
    originalImage: null,
    originalMimeType: 'image/jpeg',
    currentImage: null,
    currentImageUrl: null,
    currentMimeType: 'image/jpeg',
    resultImage: null,
    resultImageUrl: null,
    resultText: null,
    resultMimeType: 'image/png',
    isLoading: false,
    error: null,
    selectedModel: 'doubao-seedream-4-5-251128',
    history: [],
    referenceImages: [],
    selectedTool: 'face',
    selectedProvider: null,
    showApiSettings: false,
    ...overrides,
  };
}

interface RenderOpts {
  recipe?: EditRecipe;
  state?: Partial<EditorState>;
  onSubmit?: () => void;
  onRecipeChange?: (next: EditRecipe) => void;
}

function renderPanel(opts: RenderOpts = {}) {
  const recipe = opts.recipe ?? defaultRecipe('subject');
  const state = makeState(opts.state ?? {});
  const onSubmit = opts.onSubmit ?? vi.fn();
  const onRecipeChange = opts.onRecipeChange ?? vi.fn();
  const compiled = compilePrompt(recipe);

  const result = render(
    <ContextPanel
      recipe={recipe}
      onRecipeChange={onRecipeChange}
      compiled={compiled}
      state={state}
      onSubmit={onSubmit}
    />,
  );

  return { result, onSubmit, onRecipeChange, recipe, state };
}

// ===== 测试 =====

describe('ContextPanel (FLOW-001)', () => {
  describe('单 CTA 与无隐藏提交入口', () => {
    it('渲染且仅渲染一个"生成预览"主 CTA', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      const ctas = screen.getAllByRole('button', { name: '生成预览' });
      expect(ctas).toHaveLength(1);
      expect(ctas[0]).toHaveAttribute('data-cta', 'generate-preview');
    });

    it('不渲染旧"应用"或"提交"按钮（无隐藏提交入口）', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      // 旧 ParamPanel / PromptInput 的"应用"/"提交"按钮不应存在
      const applyButtons = screen.queryAllByRole('button', { name: /应用/ });
      const submitButtons = screen.queryAllByRole('button', { name: /^提交$/ });
      expect(applyButtons).toHaveLength(0);
      expect(submitButtons).toHaveLength(0);
    });

    it('点击主 CTA 触发 onSubmit 回调', () => {
      const onSubmit = vi.fn();
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
        onSubmit,
      });

      const cta = screen.getByRole('button', { name: '生成预览' });
      expect(cta).not.toBeDisabled();
      fireEvent.click(cta);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('project 任务（不可编辑）', () => {
    it('CTA 处于禁用态', () => {
      renderPanel({
        recipe: defaultRecipe('project'),
        state: { currentImage: 'fake-base64-data' },
      });

      const cta = screen.getByRole('button', { name: '生成预览' });
      expect(cta).toBeDisabled();
    });

    it('显示"当前任务不发起编辑"提示', () => {
      renderPanel({
        recipe: defaultRecipe('project'),
        state: { currentImage: 'fake-base64-data' },
      });

      expect(screen.getByText(/当前任务不发起编辑/)).toBeInTheDocument();
    });

    it('渲染 ProjectPanel 占位（不渲染人像参数）', () => {
      renderPanel({
        recipe: defaultRecipe('project'),
        state: { currentImage: 'fake-base64-data' },
      });

      // ProjectPanel 不应渲染人像参数标签
      expect(screen.queryByText('人像精修参数')).not.toBeInTheDocument();
      expect(screen.queryByText('肤色提亮')).not.toBeInTheDocument();
    });
  });

  describe('subject 任务 + 图片（可提交）', () => {
    it('CTA 处于启用态', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      const cta = screen.getByRole('button', { name: '生成预览' });
      expect(cta).not.toBeDisabled();
    });

    it('不渲染"请先上传图片"或"当前任务不发起编辑"提示', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      expect(screen.queryByText(/请先上传图片/)).not.toBeInTheDocument();
      expect(screen.queryByText(/当前任务不发起编辑/)).not.toBeInTheDocument();
    });

    it('渲染人像参数面板（含 6 个 TierSelect）', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      // 6 个人像参数标签都应存在
      expect(screen.getByText('肤色提亮')).toBeInTheDocument();
      expect(screen.getByText('磨皮')).toBeInTheDocument();
      expect(screen.getByText('瘦脸')).toBeInTheDocument();
      expect(screen.getByText('大眼')).toBeInTheDocument();
      expect(screen.getByText('去瑕疵')).toBeInTheDocument();
      expect(screen.getByText('立体光影')).toBeInTheDocument();
    });
  });

  describe('subject 任务 + 无图片（不可提交）', () => {
    it('CTA 处于禁用态', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: null },
      });

      const cta = screen.getByRole('button', { name: '生成预览' });
      expect(cta).toBeDisabled();
    });

    it('显示"请先上传图片"提示', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: null },
      });

      expect(screen.getByText(/请先上传图片/)).toBeInTheDocument();
    });
  });

  describe('loading 状态', () => {
    it('CTA 禁用并显示"生成中"文案', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data', isLoading: true },
      });

      const cta = screen.getByRole('button', { name: /生成中/ });
      expect(cta).toBeDisabled();
      // 不应同时显示"生成预览"
      expect(screen.queryByRole('button', { name: '生成预览' })).not.toBeInTheDocument();
    });

    it('loading 时 Recipe 编辑区被禁用', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data', isLoading: true },
      });

      // 描述 textarea 应被禁用
      const desc = screen.getByPlaceholderText(/保留雀斑/);
      expect(desc).toBeDisabled();
    });
  });

  describe('编译 Prompt 预览', () => {
    it('默认折叠，点击后展开', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      // 默认不显示编译后 Prompt body
      expect(screen.queryByTestId('compiled-prompt-body')).not.toBeInTheDocument();

      // 点击展开
      const toggle = screen.getByRole('button', { name: /编译后 Prompt/ });
      fireEvent.click(toggle);

      // 展开后显示
      expect(screen.getByTestId('compiled-prompt-body')).toBeInTheDocument();
    });

    it('编译 Prompt 包含版本号 v1', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      const toggle = screen.getByRole('button', { name: /编译后 Prompt/ });
      expect(toggle.textContent).toContain('v1');
    });
  });

  describe('任务切换（taskId 变化）', () => {
    it('切换到 color 任务时不渲染人像参数', () => {
      renderPanel({
        recipe: defaultRecipe('color'),
        state: { currentImage: 'fake-base64-data' },
      });

      expect(screen.queryByText('人像精修参数')).not.toBeInTheDocument();
      expect(screen.queryByText('肤色提亮')).not.toBeInTheDocument();
      // color 任务应渲染色彩描述区
      expect(screen.getByPlaceholderText(/低饱和暖调/)).toBeInTheDocument();
    });

    it('切换到 export 任务时渲染格式选择', () => {
      renderPanel({
        recipe: defaultRecipe('export'),
        state: { currentImage: 'fake-base64-data' },
      });

      expect(screen.getByText('输出格式')).toBeInTheDocument();
      expect(screen.getByText('输出质量')).toBeInTheDocument();
    });
  });
});
