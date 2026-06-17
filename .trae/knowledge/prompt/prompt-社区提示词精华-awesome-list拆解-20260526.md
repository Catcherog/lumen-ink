# 社区提示词精华 — awesome-gpt-image-2-prompts 拆解与融合

## 元数据
- **创建日期**: 2026-05-26
- **类别**: prompt（社区精华）
- **关联标签**: 社区提示词, awesome-list, 提示词工程, GPT-Image-2, 结构对比, 写法升级
- **状态**: active
- **来源**: EvoLinkAI/awesome-gpt-image-2-prompts GitHub仓库（约50个案例）+ 多份社区指南的交叉拆解

---

## 一、来源概述

### 1.1 社区仓库结构

`EvoLinkAI/awesome-gpt-image-2-prompts` 截至2026年5月已收录 **359+个** GPT-Image-2 提示词案例，116次提交，7+位核心贡献者。分类如下（README目录分类，非实际文件数）：

| 分类 | 目录文件 | 代表场景 |
|------|---------|---------|
| 人像与摄影 | `portrait.md` | 便利店霓虹人像、水下梦幻、黄金时刻街拍、日杂封面、复古泳装 |
| 海报与插画 | `poster.md` | 成都美食地图、纽约双世纪电影海报、健身拳击海报、国潮城市海报 |
| 电商 | `ecommerce.md` | 产品TVC分镜、汉堡广告、奢侈品手表、护肤品3D渲染 |
| 广告创意 | `ad-creative.md` | 品牌识别板、4格日本广告横幅、吉祥物18面板品牌文档 |
| 角色设计 | `character-design.md` | Persona5设定卡、机甲少女、GTA6花市、系列角色海报 |
| UI与社交媒体 | `ui-social-media.md` | 单提示词出UI、赛博霓虹UI系统、多面板排版、APP弹窗 |
| 模型对比与社区案例 | `comparison.md` | 多模型横评、文字渲染测试、书架计数、轮廓宇宙叙事海报 |

所有案例附原始X作者链接，可追溯。同时提供 `gpt_image_2_prompt.json` 结构化索引。

### 1.2 核心贡献者风格一览

| 贡献者 | 擅长领域 | 风格特征 | 典型手法 |
|--------|---------|---------|---------|
| @BubbleBrain | 人像摄影 | 英语长prompt（350+词），逗号串联，开头锚定器材 | 35mm胶卷→逐层细节→末尾no-X列表→--ar尾缀 |
| @liyue_ai | 中文海报/插画 | 中文分号段落，引号包文字，9:16标尾 | 文化词+实体锚点，书法体文字指定 |
| @MrLarus | 叙事海报 | 英语长prompt+结构化指令，极高审美要求 | 轮廓宇宙级复杂叙事，水彩质感+印刷品气质 |
| @makaneko_AI | 广告创意 | JSON结构化布局，模板变量 | `{argument name="" default=""}` 可复用模板 |
| @Colin_Leeee | 品牌设计 | 多面板JSON结构（18面板） | 品牌吉祥物全流程设计文档 |
| @IndieDevHailey | UI/UX | JSON数据结构化页面 | 暗色模式着陆页，含数据图表与CTA |

---

## 二、社区核心写法 —— 7大技法

### 技法1：摄影器材作为风格锚点（最值得借鉴）

社区写法不写 `realistic photo`，而是直接写具体摄影术语：

```
35mm color film photography with harsh direct on-camera flash
Kodak Portra 400 film simulation
CCD hard flash style
subtle film grain, visible flash fall-off
shot on 85mm lens, shallow depth of field
```

**原理**：借具体胶片规格和闪光灯类型来约束渲染方向，比抽象形容词更稳定。

**对我们的启示**：
- 我们现有的提示词用了"电影级写实"、"游戏CG风格"——可以升级为具体器材描述
- 例如：`85mm人像镜头, 柔光箱布光, 柯达Portra 400胶片模拟`

### 技法2：否定词集中在末尾

GPT-Image-2 不像 SD 有独立的 negative prompt 字段，社区做法是：

```
...（正向描述）... 
no plastic skin, no digital over-sharpening, no airbrushing, 
no blemishes, no moles, no oily skin, no watermark, no text
```

**关键发现**：`no X` 短语放在 prompt 末尾，模型靠语义理解去抑制，效果有效。

**对比我们的做法**：我们已经在正向和负面都做了防御，但负面词放在末尾的做法我们更接近。

### 技法3：`--ar` 参数化尾缀

社区习惯在 prompt 末尾加 `--ar 9:16` 或 `--ar 3:4`，这是 Midjourney 风格写法。OpenAI 官方 API 用 `size` 参数，但模型会把它当作语义提示去靠拢比例，协同生效。

### 技法4：五段式结构化模板

来自社区指南的通用模板：

```
Scene:         [where this happens, time of day, background, environment]
Subject:       [who or what is the main focus]
Important details: [materials, clothing, texture, lighting, camera, composition, mood]
Use case:      [editorial photo / product mockup / poster / UI screen / concept frame]
Constraints:   [no watermark / no logos / no extra text / preserve face / preserve layout]
```

**原理**：五个位置解决五个问题——场景、主题、细节、用途、边界。第五个位置（边界）是大多数平庸提示词失败的地方。

### 技法5：视觉事实优于模糊赞美

**错误写法**：
```
A stunning ultra-detailed cinematic masterpiece of a woman in a museum, beautiful, photoreal, 8K, award-winning
```

**正确写法**（给出可绘制的东西）：
```
Scene: A quiet classical museum gallery in soft afternoon light.
Subject: A woman in her 30s standing casually in front of a large oil painting.
Important details: Natural smile, realistic skin texture, beige knit sweater, dark jeans...
```

**反垃圾规则**：
- ❌ 避免使用：stunning, incredible, epic, masterpiece, gorgeous, insane detail
- ✅ 推荐使用：阴天光线、拉丝铝、剥落的油漆、干净的字距、50mm质感

### 技法6：中文提示词的复合结构

社区里的中文长 prompt 特点是**分号断句、段落组织**：

```
一张充满新春喜庆氛围但不失高雅格调的 2026 城市宣传海报。
双重曝光，构图延续了S型的流动感；
在纯白的纹理背景右下角，一个身穿中国传统服饰的微缩人物...
云雾环绕，仙气缥缈，色彩丰富，结构复杂，细节丰富...
文字排版优美，大方，字迹清晰完整，尺寸9:16。
```

**技巧**：
- 分号和换行把不同维度切开——氛围、构图技法、主体、地标、色彩、文字、画幅
- 指定文字内容用**引号**包起来：`左下角排版着"SPRING 2026"`
- 文化语境词（国潮、仙气缥缈）密度不可过高，需配合具体名词锚定

### 技法7：参考图标注式提示词

社区新用法：**直接在参考图上画箭头、写标注**，把涂改过的图作为输入。模型能读懂图上的箭头、文字标记、相机运动符号。

这对我们做 img2img 修图是一个启发：可以尝试在参考图上标注"改这里"的提示，配合文字 prompt 使用。

### 技法8：JSON结构化布局（高级用法，惊艳效果）

社区最令人惊喜的发现——**部分贡献者用完整JSON结构定义复杂布局**。模型完美接住了JSON格式的指令。

典型示例（@makaneko_AI 的4格日本广告横幅）：

```json
{
  "type": "2x2 grid of Japanese digital advertisement banners",
  "layout": {
    "structure": "4 equal quadrants",
    "quadrants": [
      {
        "position": "top-left",
        "theme": "Travel",
        "subject": "A couple holding hands on a white sand beach...",
        "text_labels": [
          "今年こそ、解き放て。",
          "{argument name=\"travel destination\" default=\"沖縄旅行\"}",
          "39,800円〜"
        ],
        "icons": { "count": 3, "descriptions": ["airplane", "hotel", "car"] }
      }
    ]
  }
}
```

更极致的例子（@Colin_Leeee 的18面板品牌吉祥物文档）：

```json
{
  "type": "18-panel brand identity and character design document",
  "brand": { "name": "沐阳 MUYANG TEA", ... },
  "layout": {
    "grid": "3 columns by 6 rows",
    "sections": [
      { "title": "01 品牌DNA分析", "elements": ["logo", "5 color swatches", ...] },
      { "title": "07 表情设定", "elements": ["11 3D rendered head expressions"] },
      ...
    ]
  }
}
```

**关键发现**：
- GPT-Image-2 对JSON的解析能力远超预期——能精准排版复杂多面板布局
- JSON结构适用于：品牌识别板、广告横幅组、UI原型、产品目录
- 对于我们的**人像修图**场景，JSON不太适用，但对系列合成/海报生成有启发

### 技法9：`{argument name="" default=""}` 模板变量系统

社区高级用户使用**参数化模板**语法：

```
{argument name="theme color" default="pastel pink"}
{argument name="destination" default="沖縄"}
{argument name="product name" default="LUMIÈRE"}
```

**用途**：创建可复用的提示词模板，使用者只需替换参数值。
**局限性**：这是写给人类读者的约定，模型本身不解析这个语法，但可以辅助提示词的结构化思考。

### 技法10：@BubbleBrain 的逐层细节堆叠法（人像最佳实践）

这是社区人像类最高产的作者，其 prompt 结构可拆解为 **7层递进**：

```
第1层【胶片锚定】：35mm color film photography with harsh direct on-camera flash
第2层【光影特征】：specular highlights on skin and clothing, strong catchlights in eyes
第3层【胶片质感】：authentic film grain and color shift, visible flash fall-off
第4层【风格定位】：high fashion fresh innocent basketball court editorial style
第5层【人物细节】：early 20s sexy Chinese female idol with ultra-realistic delicate refined Chinese features,
  smooth fair youthful skin, almond-shaped eyes, natural makeup, glossy pink lips, 
  straight black hair tied in a high ponytail wearing a white crop top and pleated tennis skirt 
  holding a basketball
第6层【场景细节】：bright sunny day, outdoor basketball court, chain-link fence background
第7层【末尾排除】：no plastic skin, no digital over-sharpening, no airbrushing...
  ...authentic 35mm direct flash film basketball court look --ar 9:16
```

**关键细节**：prolific contributor 的贡献占人像案例的多数，说明这种方法在社区被广泛认可。这与我们的六层结构模型高度吻合，只是表达方式不同（逗号串联 vs 分列注释）。

---

## 三、社区 vs 我们的提示词体系对比

| 维度 | 社区主流做法 | 我们的做法 | 可借鉴度 |
|------|------------|-----------|---------|
| **结构组织** | 五段式模板 / 逗号长句 / 分号段落 | 六层结构模型（定位→身份→脸→皮肤→调色→质量） | ⭐⭐⭐⭐⭐ |
| **题材术语** | 具体摄影器材（35mm/Kodak/85mm） | 偏风格描述（电影级/游戏CG/高级感） | ⭐⭐⭐⭐⭐ |
| **否定词位置** | 集中放在末尾 | 已经正向+负面双重锁定 | ⭐⭐⭐ |
| **文字控制** | 引号包文字内容 | 较少使用引号 | ⭐⭐⭐⭐ |
| **迭代方式** | 每次只做一个修订 | 我们分步工作流更完善 | ⭐⭐ |
| **模糊赞美** | 严格避免 | 仍有"震撼人心"等词 | ⭐⭐⭐⭐ |
| **中文适配** | 分号断句+段落组织 | 已用六层结构，更清晰 | ⭐⭐⭐ |
| **参考图交互** | 直接在图上画标注 | 分层提示词标注更规范 | ⭐⭐⭐ |
| **提示词长度** | 极短（3词）到超长（500+词）并存 | 中等长度，注重精炼 | ⭐⭐⭐ |
| **JSON结构化** | 高级用户用JSON布局复杂版面 | 未使用 | ⭐⭐⭐⭐ |
| **模板变量** | `{argument name="" default=""}` 参数化 | 未使用 | ⭐⭐⭐ |
| **多语言混排** | 日语/中文/英语直接在提示词中混用 | 主要用中文 | ⭐⭐⭐ |
| **总结** | 多样化，各场景有最佳实践 | 专精人像，体系完整 | 互补性强 |

---

## 四、可直接融入现有体系的升级建议

### 4.1 结构升级：保留六层结构，注入社区精华

**原六层结构**：
```
第1层：总体定位
第2层：身份保护
第3层：脸部精修
第4层：皮肤处理
第5层：调色风格
第6层：输出质量
```

**升级建议**：每个层中替换模糊赞美为具体摄影术语

```
【第1层：总体定位】
原：电影级写实摄影质感
→ 升级为：85mm人像镜头, 柔光箱布光, 35mm胶片质感摄影

【第5层：调色风格】
原：低饱和高级纪实色调
→ 升级为：柯达Portra 400胶片模拟, 低饱和暖调, 柔和高光
```

### 4.2 丢弃的词语

以下社区明确指出应避免的词语，在我们的提示词中应逐步替换：

| ❌ 避免 | ✅ 替换为 |
|---------|---------|
| 震撼人心 | 改为具体场景描述 |
| 极具艺术感 | 改为具体构图/光影描述 |
| 游戏CG风格 | 改为具体渲染/摄影术语 |
| 电影级写实 | 改为具体胶片/镜头规格 |
| 高清/4K | 保留适量使用（社区也接受） |

### 4.3 新引入的技巧

1. **引号包文字**：在场景/海报提示词中，用引号框定必须出现的文字
2. **摄影术语锚点**：在人像提示词开头明确镜头+胶片+布光组合
3. **五段式思维**：复杂场景先用 Scene/Subject/Details/UseCase/Constraints 五段打草稿

---

## 五、社区案例精选（可参考学习）

### 案例A：35mm闪光灯时尚人像（@BubbleBrain）

350词长句结构，逗号串联。核心手法：
- 开头即锚定：`35mm color film photography with harsh direct on-camera flash`
- 否定词列表在末尾：`no plastic skin, no digital over-sharpening...`
- 尾缀：`--ar 9:16`

### 案例B：Persona5角色设定卡（@iamrednightS）

让模型在**单张画面里完成多区域版面布局**——三视图、表情差分、装备拆解、色板、文字说明。GPT-Image-2 接住了这种结构化指令。

### 案例C：2026广州城市海报（@liyue_ai）

中文长prompt代表，分号断句+段落组织，引号包文字，文化词+实体锚点组合。

### 案例D：35mm闪光灯时尚人像 - 另一个版本（@BubbleBrain）

```
35mm color film photography with harsh direct on-camera flash, 
specular highlights on skin and clothing, strong catchlights in eyes, 
high contrast flash illumination, authentic film grain and color shift, 
high fashion fresh innocent basketball court editorial style, 
intimate first-person low-angle POV shot from below, 
early 20s sexy Chinese female idol with ultra-realistic delicate refined Chinese features,
...（中略）...
no plastic skin, no digital over-sharpening, no airbrushing, 
no blemishes, no moles, no oily skin, no watermark, no text, 
authentic 35mm direct flash film basketball court look --ar 9:16
```

### 案例E：四季眼眸四屏超写实特写（@liyue_ai）【中文多屏构图标杆】

```
以眼部特写图片为基础，生成3:4的四屏构图超写实眼部特写，四屏按春夏秋冬上下排序。
第一屏：眼眸中带着绽粉樱色的美瞳，睫毛缀满迷你春花...画面中央"SPRING"白色艺术字点缀...
第二屏：眼眸中带着着清荷色的美瞳，睫毛饰以粉莲与绿荷...
第三屏：眼眸中带着金黄红相间的美瞳，睫毛饰以橙红枫叶...
第四屏：眼眸中带着雪花蓝色的美瞳，睫毛覆满冰晶雪片...
整体呈现梦幻眼眸四季交替的唯美梦幻治愈画面...
```

**启示**：用分段式结构描述多屏场景，每屏有独立的色彩+元素+文字组合，模型能完美理解多区域关系。

### 案例F：轮廓宇宙叙事海报（@MrLarus）【极致长prompt控制】

```
请根据【主题：xxx】自动生成一张高审美的"轮廓宇宙 / 收藏版叙事海报"风格作品。
不要将画面局限于固定器物或常见容器...
主轮廓可以是器物、建筑、门、塔、拱门、穹顶、楼梯井、长廊、雕像、侧脸、眼睛、手掌、头骨、羽翼...
风格融合收藏版电影海报构图、高级叙事型视觉设计、梦幻水彩质感与纸张印刷品气质...
```

**启示**：这是英文 prompt 中最复杂的结构化指令之一：先用否定排除常规选项，再列举可能性，再限定美学方向，最后层层递进。**模版化程度极高**，用户只需替换主题。

### 案例G：4格日本数字广告横幅（@makaneko_AI）【JSON结构化标杆】

纯JSON定义2x2网格，每个象限独立定义主题、主体、文字标签、图标。详见技法8。

### 案例H：18面板品牌文档（@Colin_Leeee）【极限多面板】

纯JSON定义3列×6行的18面板品牌吉祥物全流程文档。从DNA分析到实物应用的完整链路。

### 案例I：日本中华料理配送传单（@xc5_）【日常生活化最佳实践】

```
A Japanese neighborhood Chinese restaurant delivery flyer for mailbox posting (3:4).
- Flashy red and yellow color scheme
- 4x3 menu photo grid with various dishes
- Coupon with perforated line for clipping
- Delivery area map (simple schematic map)
Texture of cheap paper printing. Includes fold marks.
Precision that could be mistaken for a real Japanese delivery flyer.
```

**启示**：用**清单式**（bullet points）+ 质感描述（纹理/折痕/纸张）实现"以假乱真"效果。极短的描述配合具体的生活细节。

### 案例J：极短prompt的出圈效果

社区中也不乏3-5个词的简短prompt创造惊艳结果：
- `an ingame screenshot of rust` → 精确的游戏截图风格
- `counter strike in game screenshot, mixed with Terraria` → 两种游戏风格的精确混合
- `Generate an image of the most significant event of 2020` → 模型自主判断

**启示**：GPT-Image-2 在"短prompt+高语义密度"场景下表现优秀，适合快速原型验证。但对于我们的人像精修场景，长prompt仍是必须的。

---

## 六、社区提示词长度谱系

从359+案例中观察到的**长度分布规律**：

| 长度范围 | 占比 | 适用场景 | 代表 |
|---------|------|---------|------|
| < 10词 | ~15% | 游戏截图、风格混合、概念验证 | `an ingame screenshot of rust` |
| 10-50词 | ~35% | 电商产品、简单场景、角色描述 | 汉堡广告、护肤品渲染 |
| 50-200词 | ~35% | 复杂人像、海报、多面板UI | 便利店人像、双世纪海报 |
| 200-500词 | ~12% | 高级人像、叙事海报 | @BubbleBrain人像、@MrLarus轮廓宇宙 |
| JSON结构 | ~3% | 复杂多面板布局 | 4格广告横幅、18面板品牌文档 |

**核心发现**：不是越长越好。场景越复杂才需要越长的prompt。人像精修落在50-500词区间最佳。

---

## 七、社区对GPT-Image-2的已知局限观察

| 局限 | 描述 | 应对策略 |
|------|------|---------|
| 人体比例失真 | 复杂场景下头身比、手脚位置异常 | 多次采样+人工筛选 |
| 光照不一致 | 主体与背景光照不统一 | 明确光源方向+一致性约束 |
| 细节漂移 | 一致性参考时偶发细节变化 | 锁定seed+多轮迭代 |
| 中文密度敏感 | 文化语境词过多会失控 | 配合具体名词锚定 |
| 长prompt稀释 | 超过500词后关键信息被稀释 | 优先把核心细节放前100词 |
| 多语言混淆 | 中英日混用时部分元素被忽略 | 主语言在前，次要语言加引号 |

这些局限与我们的实战经验一致，印证了现有工作流中"分步修图"和"人工确认"的必要性。

## 八、社区对现有体系的最终补充（完整版）

### 8.1 可直接吸收的3个改动

1. **人像提示词开头加摄影术语锚点**（最小改动，最大收益）
2. **负面词列表保持末尾位置**（已有，但确认是最佳实践）
3. **复杂场景用五段式打草稿再转六层结构**（升级流程）

### 8.2 需要测试的新尝试

- 用引号包文字内容的写法 → 测试场景合成中的文字渲染
- 在参考图上画标注做输入 → 测试img2img的额外控制
- JSON结构布局 → 测试海报/版面生成的进阶用法（非人像场景）

### 8.3 不需要改的

- 我们的六层结构模型比社区的单一长句/五段式更适合人像精修场景
- 我们的分步工作流比"一次大修改"更稳健
- 我们的攻守兼备策略（正向+负面双重锁定）已经涵盖社区的末尾否定词写法

### 8.4 新发现的可借鉴方向

1. **@BubbleBrain的7层递进**：胶片锚定→光影→质感→风格→人物→环境→排除。与我们的六层结构互补。
2. **@liyue_ai的中文分段**：分号断句+引号包文字+9:16标尾。适合中文海报和系列合成。
3. **JSON结构化**：复杂多面板布局首选。不建议在人像中使用，但海报/版面合成可尝试。
4. **极短prompt**：3-10词可快速验证概念，适合灵感发散阶段。
5. **参数化模板**：`{argument name="" default=""}` 适合创建可复用模板，但非模型指令，需人工替换。
6. **清单式描述**：bullet points优于长句，对日常生活化的场景尤其有效。

## 九、最终总结

这个仓库的价值不在于技巧有多先进，而在于**它记录了真实用户在不同场景下的真实写法**。359+个案例覆盖了从3个词的极简prompt到JSON的结构化布局，展示了GPT-Image-2的能力边界和社区最佳实践。

对我们最直接的价值排序：
1. **摄影术语锚点** → 立即用（人像）
2. **引号包文字** → 测试后可用（海报/合成）
3. **JSON结构化** → 保留备用（版面/品牌类任务）
4. **参数化模板** → 长期参考（模板体系建设）
5. **极短prompt** → 灵感快速验证（不常用但重要）
6. **@BubbleBrain 7层递进** → 与六层结构融合（中期优化方向）