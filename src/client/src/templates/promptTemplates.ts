export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  prompt: string;
  description: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // === 面部精修 ===
  {
    id: 'face-cream-skin',
    name: '韩系奶油肌',
    category: '面部精修',
    prompt: '85mm人像镜头, 柔光箱布光. 对面部进行精细修图: 肤色提亮半档, 均匀肤色, 去除暗沉和瑕疵. 保留真实皮肤纹理和毛孔, 保留面部立体光影. 韩系高级奶油肌质感, 不要塑料皮, 不要过度磨皮, 不要假白, 不要柔焦糊脸. 保持本人五官特征不变, 不要网红蛇精脸.',
    description: '自然通透的韩系奶油肌质感',
  },
  {
    id: 'face-natural-beauty',
    name: '自然美颜',
    category: '面部精修',
    prompt: '50mm人像镜头, 自然窗光. 轻微面部美化: 均匀肤色, 去除明显瑕疵, 轻微提亮. 保持完全自然的皮肤质感, 保留所有面部特征和表情. 不要改变五官形状, 不要过度修图, 保持本人辨识度.',
    description: '极轻微的自然美颜处理',
  },
  {
    id: 'face-slight-contour',
    name: '轻微修脸',
    category: '面部精修',
    prompt: '85mm人像镜头, 柔和侧光. 轻微面部调整: 下颌线轻微收紧, 鼻翼鼻头轻微缩小, 人中轻微缩短. 所有调整保持自然, 保持本人特征, 不要网红脸, 不要过度整形感. 保留真实皮肤纹理和面部立体光影.',
    description: '轻微轮廓调整，保持辨识度',
  },

  // === 背景替换 ===
  {
    id: 'bg-solid-color',
    name: '换纯色背景',
    category: '背景替换',
    prompt: '将背景替换为纯净的浅灰色渐变背景, 柔和的地面阴影. 保持人物完全不变, 保持姿势、服装、光线方向不变. 不要改变人物的任何细节.',
    description: '专业纯色背景替换',
  },
  {
    id: 'bg-scene',
    name: '换场景背景',
    category: '背景替换',
    prompt: '将背景替换为[在此描述目标场景, 如: 日式庭院, 樱花飘落, 午后暖光]. 保持人物完全不变, 保持姿势和服装不变. 调整光线方向与新场景一致, 保持自然融合. 不要改变人物的面部和身体细节.',
    description: '替换为指定场景背景',
  },
  {
    id: 'bg-remove-objects',
    name: '去除杂物',
    category: '背景替换',
    prompt: '去除画面中的[在此描述要去除的元素, 如: 路人/电线/杂物]. 用周围环境自然填充被去除的区域, 保持画面完整和自然. 不要改变人物和主要景物的任何细节.',
    description: '去除画面中的多余元素',
  },

  // === 调色风格 ===
  {
    id: 'color-new-chinese',
    name: '新中式暗调',
    category: '调色风格',
    prompt: '柯达Portra 400胶片模拟, 新中式暗调电影感调色. 低饱和, 灰绿色环境色, 暖金色高光, 墨绿暗部. 暖色窗光, 暗部深但保留细节, 柔和高光. 胶片质感, 细腻颗粒感. 保持人物面部特征和皮肤质感不变, 不要改变构图.',
    description: '新中式暗调电影感风格',
  },
  {
    id: 'color-japanese-fresh',
    name: '通透日系',
    category: '调色风格',
    prompt: '富士Pro 400H胶片模拟, 通透日系调色. 轻微过曝, 柔和高光, 淡青色阴影, 整体偏冷但肤色保持暖调. 去灰, 提亮暗部, 保持色彩层次分明. 保持人物面部特征不变, 不要改变构图和皮肤质感.',
    description: '清新通透的日系色调',
  },
  {
    id: 'color-cinematic-warm',
    name: '电影感暖调',
    category: '调色风格',
    prompt: '柯达Vision3 500T电影胶片模拟, 电影感暖调. 暖橙色高光, 深蓝色阴影, 整体偏暖. 宽容度高的影调, 暗部有细节, 高光不过曝. 细腻胶片颗粒感. 保持人物面部特征不变, 不要改变构图.',
    description: '电影胶片感的暖色调',
  },

  // === 风格迁移 ===
  {
    id: 'style-ref-image',
    name: '按参考图风格',
    category: '风格迁移',
    prompt: '按照参考图的色调、光影和整体风格修改这张照片. 保持人物完全不变, 保持姿势和服装不变. 只调整色调、光影和氛围, 使其与参考图风格一致. 不要改变人物的面部和身体细节.',
    description: '参考图风格迁移',
  },
  {
    id: 'style-photography',
    name: '按摄影风格',
    category: '风格迁移',
    prompt: '将这张照片调整为[在此描述摄影风格, 如: 90年代港风/法式复古/北欧极简]的摄影风格. 调整色调、光影和氛围以匹配该风格. 保持人物面部特征不变, 不要改变五官和表情.',
    description: '指定摄影风格迁移',
  },
];

export const TEMPLATE_CATEGORIES = ['面部精修', '背景替换', '调色风格', '风格迁移'];
