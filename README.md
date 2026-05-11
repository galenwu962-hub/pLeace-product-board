# 南京德基新店开业总控驾驶舱

这是一个已经升级成“协作版架构”的开业管理工具，既能本地直接打开，也可以挂到 GitHub Pages 给团队访问。

## 当前能力

- 基于原始 CSV 生成结构化任务底表
- 倒计时、风险雷达、时间轴、部门负荷、待补日期清单
- 任务筛选
- 新增任务
- 编辑任务
- 手动维护任务状态
- 云端自动同步
- 支持两种数据模式
  - `local`: 本地浏览器存储，适合演示和单人整理
  - `supabase`: 云端共享表，适合团队共同维护

## 关键文件

- `index.html`: 驾驶舱入口
- `app.js`: 页面逻辑、任务 CRUD、数据源切换
- `config.js`: 当前运行配置
- `config.example.js`: 云端模式配置示例
- `db/schema.sql`: Supabase 数据表与策略
- `scripts/build_data.py`: 从原始 CSV 生成种子数据
- `.github/workflows/pages.yml`: GitHub Pages 自动发布

## 本地使用

直接打开：

```bash
open /Users/wuzhiyang/Desktop/deji-opening-dashboard/index.html
```

## 更新原始总控表

如果 CSV 更新，重新生成种子数据：

```bash
python3 /Users/wuzhiyang/Desktop/deji-opening-dashboard/scripts/build_data.py
```

## 团队共享模式

1. 在 Supabase 新建项目
2. 执行 `db/schema.sql`
3. 把 `config.example.js` 的内容填进 `config.js`
4. 将整个目录推到一个 GitHub 仓库根目录
5. 开启 GitHub Pages
6. `main` 分支更新后会自动发布

发布后，团队通过 GitHub Pages 域名访问；任务新增和编辑写入 Supabase。
默认会每 30 秒自动同步一次，回到页面焦点时也会自动拉最新数据，也可以点击“立即同步”。

## 注意

当前 `schema.sql` 里的策略是为了快速落地协作版，默认允许匿名读写，适合内部团队快速试运行。正式长期使用前，建议下一步补登录权限或更细的写入控制。
