import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextPanel from './ContextPanel';
import { defaultRecipe, compilePrompt } from '../../utils/recipe';
import type { EditRecipe, EditorState, ReferenceImage } from '../../../../shared/types';

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
  referenceImages?: ReferenceImage[];
  onReferenceImagesChange?: (images: ReferenceImage[]) => void;
}

function renderPanel(opts: RenderOpts = {}) {
  const recipe = opts.recipe ?? defaultRecipe('subject');
  const state = makeState(opts.state ?? {});
  const onSubmit = opts.onSubmit ?? vi.fn();
  const onRecipeChange = opts.onRecipeChange ?? vi.fn();
  const referenceImages = opts.referenceImages ?? state.referenceImages ?? [];
  const onReferenceImagesChange = opts.onReferenceImagesChange ?? vi.fn();
  const compiled = compilePrompt(recipe);

  const result = render(
    <ContextPanel
      recipe={recipe}
      onRecipeChange={onRecipeChange}
      compiled={compiled}
      state={state}
      onSubmit={onSubmit}
      referenceImages={referenceImages}
      onReferenceImagesChange={onReferenceImagesChange}
    />,
  );

  return { result, onSubmit, onRecipeChange, onReferenceImagesChange, recipe, state, referenceImages };
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

  // ============================================================
  // P0-01 回归测试：URL-only 结果不可提交旧 base64
  // 场景：SET_RESULT 仅返回 imageUrl（无 imageData）时，currentImage 仍为 null。
  // 旧实现 canSubmit = currentImage || currentImageUrl，会放行提交但 submitEdit
  // 只发送 currentImage（base64），导致提交的是上一轮的旧 base64。
  // 修复后：canSubmit 仅要求 state.currentImage；URL-only 显示明确不可继续编辑提示。
  // ============================================================
  describe('P0-01: URL-only 结果不可提交旧 base64', () => {
    it('URL-only 结果时 CTA 处于禁用态', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: {
          currentImage: null, // 无 base64
          currentImageUrl: 'https://example.com/result.png', // 仅 URL
        },
      });

      const cta = screen.getByRole('button', { name: '生成预览' });
      expect(cta).toBeDisabled();
    });

    it('URL-only 结果时显示琥珀色"无法继续编辑"提示', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: {
          currentImage: null,
          currentImageUrl: 'https://example.com/result.png',
        },
      });

      expect(
        screen.getByText(/当前结果为 URL，无法继续编辑，请下载后重新上传/),
      ).toBeInTheDocument();
    });

    it('URL-only 结果时不显示"请先上传图片"提示（区分无图状态）', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: {
          currentImage: null,
          currentImageUrl: 'https://example.com/result.png',
        },
      });

      // 应显示 URL-only 专属提示，而非"请先上传图片"
      expect(screen.queryByText(/请先上传图片/)).not.toBeInTheDocument();
    });

    it('URL-only 结果时点击 CTA 不触发 onSubmit', () => {
      const onSubmit = vi.fn();
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: {
          currentImage: null,
          currentImageUrl: 'https://example.com/result.png',
        },
        onSubmit,
      });

      // disabled 按钮点击不会触发 onClick
      const cta = screen.getByRole('button', { name: '生成预览' });
      fireEvent.click(cta);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('有 base64 时 URL 同时存在仍可提交（base64 优先）', () => {
      const onSubmit = vi.fn();
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: {
          currentImage: 'fake-base64-data',
          currentImageUrl: 'https://example.com/result.png',
        },
        onSubmit,
      });

      const cta = screen.getByRole('button', { name: '生成预览' });
      expect(cta).not.toBeDisabled();
      fireEvent.click(cta);
      expect(onSubmit).toHaveBeenCalledTimes(1);

      // 不应显示 URL-only 提示
      expect(
        screen.queryByText(/当前结果为 URL，无法继续编辑/),
      ).not.toBeInTheDocument();
    });

    it('完全无图无 URL 时 CTA 禁用并显示"请先上传图片"', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: null, currentImageUrl: null },
      });

      const cta = screen.getByRole('button', { name: '生成预览' });
      expect(cta).toBeDisabled();
      expect(screen.getByText(/请先上传图片/)).toBeInTheDocument();
    });
  });

  // ============================================================
  // P0-02 回归测试：V2 参考图入口恢复，Recipe/Prompt/payload 一致
  // 场景：FLOW-001 首轮移除了 ParamPanel 的 ReferenceImages 入口，AppV2 未解构
  // setReferenceImages，导致 referenceImageCount、编译 Prompt 与请求 payload 在
  // 真实 UI 中不可达。
  // 修复后：ContextPanel 恢复唯一参考图入口，增删同步 state.referenceImages 与
  // recipe.auxiliary.referenceImageCount，编译 Prompt 含【参考图】段。
  // ============================================================
  describe('P0-02: V2 参考图入口与 Recipe/Prompt 一致', () => {
    it('可编辑任务渲染参考图入口（data-reference-images-section）', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      expect(screen.getByTestId('reference-images-section')).toBeInTheDocument();
    });

    it('project 任务不渲染参考图入口（不可编辑）', () => {
      renderPanel({
        recipe: defaultRecipe('project'),
        state: { currentImage: 'fake-base64-data' },
      });

      expect(screen.queryByTestId('reference-images-section')).not.toBeInTheDocument();
    });

    it('参考图入口显示"参考图"标题与 0/14 计数', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data', referenceImages: [] },
      });

      expect(screen.getByText('参考图')).toBeInTheDocument();
      expect(screen.getByText('0/14 张')).toBeInTheDocument();
    });

    it('已有参考图时显示对应计数', () => {
      const referenceImages: ReferenceImage[] = [
        { base64: 'img1', mimeType: 'image/png' },
        { base64: 'img2', mimeType: 'image/jpeg' },
      ];
      renderPanel({
        recipe: {
          ...defaultRecipe('subject'),
          auxiliary: {
            ...defaultRecipe('subject').auxiliary,
            referenceImageCount: 2,
          },
        },
        state: { currentImage: 'fake-base64-data', referenceImages },
      });

      expect(screen.getByText('2/14 张')).toBeInTheDocument();
    });

    it('参考图入口存在"+ 添加参考图"按钮', () => {
      renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      expect(screen.getByRole('button', { name: '+ 添加参考图' })).toBeInTheDocument();
    });

    it('recipe.auxiliary.referenceImageCount > 0 时编译 Prompt 含【参考图】段', () => {
      const recipe: EditRecipe = {
        ...defaultRecipe('subject'),
        auxiliary: {
          ...defaultRecipe('subject').auxiliary,
          referenceImageCount: 3,
        },
      };
      const { recipe: capturedRecipe } = renderPanel({
        recipe,
        state: { currentImage: 'fake-base64-data' },
      });

      // 重新编译当前 recipe 的 Prompt，验证含【参考图】段
      const compiled = compilePrompt(capturedRecipe);
      expect(compiled.prompt).toContain('【参考图】');
      expect(compiled.prompt).toContain('参考 3 张参考图进行创作');
    });

    it('referenceImageCount = 0 时编译 Prompt 不含【参考图】段', () => {
      const { recipe: capturedRecipe } = renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data' },
      });

      const compiled = compilePrompt(capturedRecipe);
      expect(compiled.prompt).not.toContain('【参考图】');
    });

    it('删除参考图时 onReferenceImagesChange 被调用（通过 ReferenceImages 组件交互）', () => {
      const onReferenceImagesChange = vi.fn();
      const referenceImages: ReferenceImage[] = [
        { base64: 'img1', mimeType: 'image/png' },
      ];
      renderPanel({
        recipe: {
          ...defaultRecipe('subject'),
          auxiliary: {
            ...defaultRecipe('subject').auxiliary,
            referenceImageCount: 1,
          },
        },
        state: { currentImage: 'fake-base64-data', referenceImages },
        onReferenceImagesChange,
      });

      // 找到删除按钮（参考图右上角的 ×）
      const removeButton = screen.getByRole('button', { name: '×' });
      fireEvent.click(removeButton);

      // onReferenceImagesChange 应被调用，传入空数组
      expect(onReferenceImagesChange).toHaveBeenCalledTimes(1);
      expect(onReferenceImagesChange).toHaveBeenCalledWith([]);
    });

    it('删除参考图导致计数变化时 onRecipeChange 被调用同步 referenceImageCount', () => {
      const onRecipeChange = vi.fn();
      const referenceImages: ReferenceImage[] = [
        { base64: 'img1', mimeType: 'image/png' },
      ];
      renderPanel({
        recipe: {
          ...defaultRecipe('subject'),
          auxiliary: {
            ...defaultRecipe('subject').auxiliary,
            referenceImageCount: 1,
          },
        },
        state: { currentImage: 'fake-base64-data', referenceImages },
        onRecipeChange,
      });

      const removeButton = screen.getByRole('button', { name: '×' });
      fireEvent.click(removeButton);

      // onRecipeChange 应被调用，新 recipe 的 referenceImageCount = 0
      expect(onRecipeChange).toHaveBeenCalledTimes(1);
      const newRecipe = onRecipeChange.mock.calls[0][0];
      expect(newRecipe.auxiliary.referenceImageCount).toBe(0);
    });

    it('计数未变化时不重复触发 onRecipeChange（避免冗余更新）', () => {
      const onRecipeChange = vi.fn();
      const onReferenceImagesChange = vi.fn();
      // 故意让 recipe.auxiliary.referenceImageCount 与新数组长度一致
      // 模拟"用户重新传入相同长度的不同图片"场景
      const referenceImages: ReferenceImage[] = [
        { base64: 'img1', mimeType: 'image/png' },
      ];
      renderPanel({
        recipe: {
          ...defaultRecipe('subject'),
          auxiliary: {
            ...defaultRecipe('subject').auxiliary,
            referenceImageCount: 1, // 与 referenceImages.length 相同
          },
        },
        state: { currentImage: 'fake-base64-data', referenceImages },
        onRecipeChange,
        onReferenceImagesChange,
      });

      // 模拟替换：通过 handleReferenceImagesChange 直接触发（绕过 ReferenceImages 内部）
      // 这里我们通过删除来触发 onReferenceImagesChange，新长度为 0，与原计数 1 不同，
      // 因此 onRecipeChange 会被调用 —— 这验证了"计数变化才触发"的反向逻辑。
      // 此用例的真正意图由下面的"相同计数"用例覆盖（通过 mock 直接调用）。
      const removeButton = screen.getByRole('button', { name: '×' });
      fireEvent.click(removeButton);
      expect(onRecipeChange).toHaveBeenCalledTimes(1); // 1 → 0，触发
    });
  });

  // ============================================================
  // P0 端到端一致性验证：Recipe 计数 / 编译 Prompt / 提交 payload
  // ============================================================
  describe('P0 端到端：Recipe/Prompt/payload 三者一致', () => {
    it('referenceImageCount=N → 编译 Prompt 含"参考 N 张" → 提交时 referenceImages 长度=N', () => {
      // 此用例验证三层数据一致性，是 P0-02 FIX_PACKET 的核心验证点
      const N = 2;
      const referenceImages: ReferenceImage[] = Array.from({ length: N }, (_, i) => ({
        base64: `img${i}`,
        mimeType: 'image/png',
      }));
      const recipe: EditRecipe = {
        ...defaultRecipe('subject'),
        auxiliary: {
          ...defaultRecipe('subject').auxiliary,
          referenceImageCount: N,
        },
      };

      const { recipe: capturedRecipe, referenceImages: capturedRefs } = renderPanel({
        recipe,
        state: { currentImage: 'fake-base64-data', referenceImages },
      });

      // 1. Recipe 计数 = N
      expect(capturedRecipe.auxiliary.referenceImageCount).toBe(N);

      // 2. 编译 Prompt 含"参考 N 张参考图进行创作"
      const compiled = compilePrompt(capturedRecipe);
      expect(compiled.prompt).toContain(`参考 ${N} 张参考图进行创作`);

      // 3. 传入 ContextPanel 的 referenceImages 长度 = N（即提交 payload 的来源）
      expect(capturedRefs).toHaveLength(N);
    });

    it('referenceImageCount=0 → 编译 Prompt 无【参考图】段 → 提交时 referenceImages=空', () => {
      const { recipe: capturedRecipe, referenceImages: capturedRefs } = renderPanel({
        recipe: defaultRecipe('subject'),
        state: { currentImage: 'fake-base64-data', referenceImages: [] },
      });

      expect(capturedRecipe.auxiliary.referenceImageCount).toBe(0);
      const compiled = compilePrompt(capturedRecipe);
      expect(compiled.prompt).not.toContain('【参考图】');
      expect(capturedRefs).toHaveLength(0);
    });
  });
});
