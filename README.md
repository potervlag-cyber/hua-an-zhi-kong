# 化安智控——化工过程安全与清洁生产智能辅助系统

“化安智控”是面向化工相关专业学生、实验室人员、企业基层操作人员和安全管理人员的移动端友好 Web APP 原型。系统覆盖化学品安全查询、设备安全巡检、事故应急指导、清洁生产评价与反应釜 PID 温度控制仿真。

> 安全声明：本系统用于学习、辅助判断和初步风险识别，不替代化学品 SDS、企业操作规程、作业许可、应急预案、设备说明书、法定检验或专业人员判断。

## 1. 总体功能架构

```text
化安智控
├─ 工作台
│  ├─ 核心模块入口
│  ├─ 数据库状态与统计
│  ├─ 最近查询 / 最近巡检
│  └─ 风险预警与免责声明
├─ 化学品安全查询
│  ├─ 多字段搜索与危险类别筛选
│  ├─ 理化、安全、防护、泄漏与灭火详情
│  ├─ 收藏 / 最近查询 / 双物质对比
│  ├─ 禁忌物提示与安全信息卡导出
│  └─ 跳转对应应急指导
├─ 设备安全巡检与风险评估
│  ├─ 18 类设备选择
│  ├─ 分步检查向导
│  ├─ 异常即时弹窗与处置建议
│  ├─ 动态风险评分
│  └─ 风险报告、PDF 打印和 CSV/Excel 兼容导出
├─ 事故应急处置指导
│  ├─ 23 类事故检索
│  ├─ 响应等级快速研判
│  ├─ 六阶段分步应急向导
│  └─ 禁忌、PPE、升级与恢复条件
├─ 清洁生产与能耗排放评价
│  ├─ 产量、物耗、能耗与排放输入
│  ├─ 单耗、利用率、收率等指标计算
│  ├─ 六维加权评分与等级
│  └─ 动态改进建议和打印报告
└─ 反应釜温度智能控制仿真
   ├─ 能量平衡与离散 PID
   ├─ 加热、冷却、散热和反应放热
   ├─ 动态温度/控制输出曲线
   ├─ 超调、稳态误差、调节时间分析
   └─ PID 对比试验与 CSV 数据导出
```

## 2. 页面结构与导航关系

- 桌面端采用固定深蓝侧边栏；移动端采用底部导航栏，所有核心功能单手可达。
- 顶部状态栏显示当前模块、本地知识库状态与风险提醒。
- 工作台是默认入口，五张任务卡分别进入五个核心模块。
- 化学品详情可跳转应急模块；巡检异常可从页头进入应急模块。
- 使用 URL Hash 保存当前模块，例如 `#chemicals`、`#inspection`，刷新后仍可回到对应页面。

## 3. 模块交互流程

### 3.1 化学品安全查询

1. 输入中文名、英文名、CAS、分子式或危险关键词。
2. 选择易燃、有毒、腐蚀、氧化、爆炸或一般工业品筛选。
3. 结果卡按绿、黄、橙、红展示风险等级。
4. 点击详情查看 20 余项理化与安全字段、来源链接和安全提示。
5. 可收藏、生成文本安全信息卡，或选择两种化学品进行对比。
6. 对比时系统根据禁忌字段给出相容性评估提醒。
7. 发生事故时可从详情进入应急处置模块。

### 3.2 设备安全巡检

1. 选择设备类型，填写设备位号与检查人员。
2. 系统仅显示当前检查项，并给出检查方法和正常判定标准。
3. 选择“正常 / 异常 / 不适用 / 待复核”，填写实测值和备注。
4. 选择“异常”时立即展示后果、处置建议、停机与上报提示。
5. 顶部进度条和底部风险得分随检查结果实时更新。
6. 完成全部项目后进行二次确认并提交报告。
7. 报告保存在浏览器本机，可打印为 PDF 或导出 Excel 兼容 CSV。

### 3.3 事故应急指导

1. 通过事故名称、类别或征兆检索事故类型。
2. 根据规模、人员受伤和厂外影响研判蓝/黄/橙/红响应建议。
3. 二次确认后启动应急流程。
4. 按“报警撤离→切断停车→警戒检测→专业控制→救护环境→监测恢复”逐步执行。
5. 每步同时展示禁止操作、PPE、升级条件与恢复条件。
6. 所有步骤均可勾选完成；最终恢复必须经过检测、设备完整性确认与批准。

### 3.4 清洁生产评价

1. 输入生产周期内产量、原料、能源、水、排放和回收数据。
2. 页面实时计算九项核心指标和六个评价维度。
3. 按 100 分制加权汇总，输出一至四级清洁生产水平。
4. 根据超目标指标生成源头减量、回收利用、换热优化等建议。

### 3.5 PID 温控仿真

1. 设置初始/目标/环境温度、物料参数、加热冷却能力、仿真周期和 PID 参数。
2. 点击开始后按离散时间步推进能量平衡。
3. 动态显示温度、偏差、加热功率、冷却阀门与变化速率。
4. 自动计算最大超调、稳态误差、调节时间和稳定性。
5. 可暂停、重置、导出数据，并与一组更保守的 PID 参数对比。

## 4. 建议数据库表结构

当前原型使用静态 JSON 和浏览器本地存储，后续后端可按下表落库。所有主键建议使用 UUID；业务表统一增加 `created_at`、`updated_at`、`deleted_at` 和 `version`。

| 表名 | 关键字段 | 说明 |
|---|---|---|
| `chemicals` | `id, name_zh, name_en, cas_no, formula, molecular_weight, appearance, melting_point, boiling_point, density, solubility, category` | 化学品基础理化信息 |
| `chemical_safety` | `chemical_id, hazard_class, flash_point, explosive_limits, toxicity, storage, ppe, spill_response, firefighting, incompatibilities, source_url, risk_level` | 一对一或按版本保存安全信息 |
| `equipment_types` | `id, category, name, focus, typical_risks, enabled` | 设备类型字典 |
| `inspection_items` | `id, equipment_type_id, item_name, method, normal_standard, consequence, action, frequency, role, risk_weight, sort_order` | 可配置巡检知识库 |
| `inspection_records` | `id, equipment_type_id, equipment_tag, inspector_id, started_at, completed_at, status, score, risk_level` | 巡检主记录 |
| `inspection_record_items` | `record_id, inspection_item_id, result, measured_value, note, photo_url, severity` | 巡检明细，建议单独建表 |
| `risk_reports` | `id, inspection_record_id, normal_count, abnormal_count, review_count, score, risk_level, actions, priority, deadline, review_required` | 自动生成的风险报告 |
| `accident_types` | `id, category, name, signs, risks, base_response_level, scenarios` | 事故类型字典 |
| `emergency_steps` | `id, accident_type_id, step_no, phase, action, cautions, prohibited, ppe, escalation_rule, professional_only` | 分步应急知识库 |
| `cleaner_production_records` | `id, period_start, period_end, product_output, raw_input, water, electricity, steam, gas, fuel, wastewater, wastegas, solid_waste, score, grade, metrics_json` | 清洁生产输入与结果 |
| `simulation_parameters` | `id, user_id, name, initial_temp, target_temp, ambient_temp, mass, cp, max_heat, max_cool, duration, dt, kp, ki, kd, alarm_temp` | 仿真方案参数 |
| `simulation_results` | `id, parameter_id, reached_target, overshoot, max_overshoot, steady_error, settling_time, stable, series_json, report_json` | 仿真结果与曲线 |
| `users` | `id, username, display_name, role, organization, password_hash, status, last_login_at` | 用户和角色 |

建议 API 预留：`GET/POST/PATCH/DELETE /api/v1/{resource}`、`POST /api/v1/import/excel`、`POST /api/v1/device-data`、`GET /api/v1/reports/{id}`。真实设备数据接入时增加 `sensors`、`sensor_bindings`、`telemetry`、`alarm_rules` 与 `alarm_events`。

## 5. 风险评估算法

每个巡检项配置风险权重：一般 1、重要 2、关键安全项 3、重大危险项 5。结果严重度：正常/不适用 0、待复核 1、一般异常 2、重大异常 5。

```text
基础分 = Σ(检查项风险权重 × 结果严重度)
异常数量修正系数 = 1 + max(0, 异常数 - 1) × 0.1
设备综合风险得分 = round(基础分 × 异常数量修正系数)
```

| 得分 | 风险等级 |
|---:|---|
| 0–10 | 低风险 |
| 11–25 | 一般风险 |
| 26–39 | 较高风险 |
| ≥40 | 重大风险 |

“超温、超压、飞温、容器破裂、关键联锁失效”等项目在原型中自动赋 5 分权重。正式应用应由企业 HAZOP/LOPA、设备完整性与历史事件数据校准权重和阈值。

## 6. 清洁生产计算公式

```text
单位产品耗水量 = 新鲜水使用量 / 产品产量
单位产品耗电量 = 电力使用量 / 产品产量
单位产品综合能耗 = (电力×0.1229 + 蒸汽×128.6 + 天然气×1.2143 + 燃料×1457.1) / 产品产量
原料利用率 = 产品中有效原料量 / 原料投入量 × 100%
产品收率 = 实际产品产量 / 理论产品产量 × 100%
单位产品废水量 = 废水产生量 / 产品产量
单位产品固废量 = 固体废物产生量 / 产品产量
水重复利用率 = 循环使用水量 / (新鲜水量 + 循环水量) × 100%
副产物回收率 = 实际回收副产物量 / 可回收副产物总量 × 100%
```

原型权重为：能源 25%、水资源 20%、原料利用 20%、废水 15%、废气 10%、固废与回收 10%。评分 ≥90 为一级，75–89.9 为二级，60–74.9 为三级，低于 60 为四级。折标系数和目标值仅用于演示，正式项目应使用适用行业清洁生产评价指标体系和企业能源计量口径。

## 7. PID 温度控制仿真算法

模型采用离散能量平衡：

```text
dT/dt = (Q加热 + Q反应 - Q冷却 - Q散热) / (m × Cp)
e[k] = T设定 - T实际[k]
u[k] = Kp×e[k] + Ki×Σ(e[k]Δt) + Kd×(e[k]-e[k-1])/Δt
T[k+1] = T[k] + (dT/dt)×Δt
```

- `u > 0` 映射为 0–100% 加热功率；负输出与超温偏差映射为 0–100% 冷却阀开度。
- 对积分项实施上下限约束，并在输出饱和且误差继续推动饱和时停止积分，防止积分饱和。
- 温度达到 `报警值 + 2℃` 时自动切断加热，保留冷却控制。
- 反应放热按指数衰减，散热与物料温度和环境温度差成正比。
- 结果评价使用最大温度、最大超调、2% 误差带调节时间、稳态误差和稳定性。

本模型用于控制原理教学与参数趋势比较，不用于真实反应釜控制器整定。

## 8. UI 设计

- 工业安全风格：深蓝为主界面，绿/黄/橙/红传达风险语义。
- 首页首屏突出“任务入口 + 系统就绪状态”，避免信息堆叠。
- 巡检和应急采用单项分步向导、进度条、上下步和异常弹窗。
- 化学品详情使用右侧抽屉，桌面端不打断检索上下文，移动端自动全屏。
- 清洁生产和 PID 页面使用输入、指标、图表和建议分区，支持小屏单列布局。
- 所有重要按钮具有键盘焦点状态；触控目标适配移动设备。

## 9. 项目结构

```text
app/
├─ AppClient.tsx          # 应用壳与五个交互模块
├─ data.ts                # Excel 数据映射、类型与风险标签
├─ data/source-data.json  # 从三份 Excel 提取的演示知识库
├─ globals.css            # 工业安全视觉系统与响应式样式
├─ layout.tsx             # 中文元数据
└─ page.tsx               # 应用入口
work/
├─ extract-source-json.mjs # 可重复执行的数据提取脚本
└─ inspect-sources.mjs     # Excel 结构检查脚本
```

## 10. 示例数据

原型已接入工作区中的三份 Excel：

- `100种常见化学品理化与安全数据.xlsx`：100 种化学品及 23 个字段。
- `常用化工设备安全检查与现场巡检表.xlsx`：18 类设备和 107 条检查知识。
- `常见化工事故类型与分步应急流程.xlsx`：23 类事故、分步流程、应急卡和记录模板。

收藏、最近查询和巡检报告保存在浏览器 `localStorage`，不上传外部服务。后端接入后可用 API 替换本地状态层，现有模块无需改变交互结构。

## 11. 部署与运行

环境要求：Node.js 22.13 或更高版本。

```bash
pnpm install
pnpm dev
```

打开终端显示的本地地址。生产构建：

```bash
pnpm build
pnpm start
```

项目采用 vinext/Next.js 兼容结构并保留 `.openai/hosting.json`，可进一步接入 D1/MySQL、R2/对象存储、FastAPI、Node.js 或 Spring Boot 服务。部署真实生产环境前必须完成权限控制、审计日志、数据库迁移、备份恢复、输入校验、SDS 版本管理、企业级安全评审和设备接口隔离。
