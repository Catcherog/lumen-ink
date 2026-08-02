import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EphemeralProviderSettings from './EphemeralProviderSettings';

const openAiConfig = {
  type: 'openai' as const,
  defaultModel: 'gpt-image-2',
  apiKey: 'sk-openai-secret',
};

function renderSettings(
  onChange = vi.fn(),
  onClose = vi.fn(),
  value = openAiConfig,
) {
  render(
    <EphemeralProviderSettings
      isOpen
      value={value}
      onChange={onChange}
      onClose={onClose}
    />,
  );
  return { onChange, onClose };
}

describe('EphemeralProviderSettings', () => {
  it('clears the previous provider key in the draft immediately after a provider switch', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSettings();

    await user.selectOptions(screen.getByRole('combobox', { name: /provider/i }), 'gemini');

    expect(screen.getByRole('combobox', { name: /model/i })).toHaveValue(
      'gemini-2.5-flash-image',
    );
    expect(screen.getByLabelText(/api key/i)).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({
      type: 'gemini',
      defaultModel: 'gemini-2.5-flash-image',
      apiKey: '',
    });
  });

  it('does not mutate the saved provider when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    const { onChange, onClose } = renderSettings();

    await user.selectOptions(screen.getByRole('combobox', { name: /provider/i }), 'gemini');
    await user.type(screen.getByLabelText(/api key/i), 'sk-gemini-secret');
    await user.click(screen.getByRole('button', { name: /取消/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('commits only the new provider and key on save', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSettings();

    await user.selectOptions(screen.getByRole('combobox', { name: /provider/i }), 'gemini');
    await user.type(screen.getByLabelText(/api key/i), 'sk-gemini-secret');
    await user.click(screen.getByRole('button', { name: /保存/i }));

    expect(onChange).toHaveBeenCalledWith({
      type: 'gemini',
      defaultModel: 'gemini-2.5-flash-image',
      apiKey: 'sk-gemini-secret',
    });
  });
});
