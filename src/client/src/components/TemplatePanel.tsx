import { useMemo, useState } from 'react';
import { PROMPT_TEMPLATES, TEMPLATE_CATEGORIES } from '../templates/promptTemplates';
import type { RetouchTool } from '../../../shared/types';

interface TemplatePanelProps {
  onSelectTemplate: (prompt: string) => void;
  tool?: RetouchTool;
}

export default function TemplatePanel({ onSelectTemplate, tool }: TemplatePanelProps) {
  const visibleCategories = useMemo(() => {
    if (!tool) return TEMPLATE_CATEGORIES;
    const toolCategories = new Set(
      PROMPT_TEMPLATES.filter(t => t.tool === tool).map(t => t.category)
    );
    return TEMPLATE_CATEGORIES.filter(cat => toolCategories.has(cat));
  }, [tool]);

  const [activeCategory, setActiveCategory] = useState(visibleCategories[0]);

  const currentCategory = visibleCategories.includes(activeCategory)
    ? activeCategory
    : visibleCategories[0];

  const filteredTemplates = useMemo(() => {
    const byCategory = PROMPT_TEMPLATES.filter(t => t.category === currentCategory);
    if (!tool) return byCategory;
    return byCategory.filter(t => t.tool === tool);
  }, [currentCategory, tool]);

  return (
    <div>
      {/* Category tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {visibleCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
              currentCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredTemplates.map(template => (
          <button
            key={template.id}
            onClick={() => onSelectTemplate(template.prompt)}
            className="w-full text-left p-2.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800">{template.name}</span>
              <span className="text-xs text-blue-500">使用</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
