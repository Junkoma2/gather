# design.md

gather の設計ドキュメント。

---

## 設計思想

**思考のつながりを、canvasの動きとして感じられるようにする。** 似た考えは寄り、相反する考えは離れる。
説明や機能で補うより、動きそのものから気づけることを優先する。

### 判断基準

- 円の動きだけで関係が感じられるか
- 大きな考えが場の軸として見えるか
- 近い考えと相反する考えの差が、押しつけがましくなく現れるか
- 入力よりも観察の面白さが前に出ているか

---

## アーキテクチャ概要

`index.html` / `script.js` / `styles.css` がエントリポイント。フレームワーク・ビルドステップなし。
canvas を中心とした描画ループ構成（`requestAnimationFrame`）。

```
gather/
├── index.html          # アプリ本体
├── script.js           # ロジック全体（物理演算・描画・UI）
├── styles.css          # スタイル
├── sw.js               # Service Worker
└── docs/
    ├── product-principles.md
    └── design.md       # このファイル
```

デプロイは GitHub Pages。`main` への push で即時反映（予定）。

---

## データ構造

### localStorage キー

| キー | 内容 |
|---|---|
| `gather-thoughts` | 考えリスト（JSON配列） |
| `gather-hint-shown` | 初回ヒント表示済みフラグ（"1" または未設定） |

### 考えのスキーマ

```json
{
  "id": "uuid-v4",
  "title": "静かさ",
  "note": "ノイズがない状態",
  "color": "#7fb7be",
  "hue": 190,
  "radius": 32,
  "x": 320.5,
  "y": 240.0,
  "vx": 0.12,
  "vy": -0.08
}
```

- `id` — `crypto.randomUUID()` で生成
- `title` — 表示テキスト（canvas上に描画される）
- `note` — メモ（dialog内のみ表示、canvas非表示）
- `color` — 16進数カラーコード
- `hue` — 色相角（0〜360）。物理演算での引力・斥力の計算に使用
- `radius` — 円の半径（px）。サイズを表す
- `x`, `y` — canvas上の座標（CSS px）
- `vx`, `vy` — 速度ベクトル（px/frame）

### エクスポートのフォーマット

```json
{
  "version": 1,
  "exportedAt": "2026-01-20T08:00:00.000Z",
  "thoughts": [...]
}
```

インポート時は `isValidThought` でバリデーション。`normalizeThoughts()` で欠損フィールドを補完する。ファイルサイズ上限は 2MB。

---

## 物理演算の仕組み

### 引力・斥力の計算

毎フレーム `updatePhysics()` が全ペア（O(n²)）を走査し、各ペアに力を適用する。

- **色相距離**（`hueDistance`）: 円環上の最短距離（0〜180）
- **closeness**: `1 - colorGap / 180`（0〜1。1が最も近い）
- `closeness >= 0.45` のとき引力、未満のとき斥力
- 力の大きさは `mass`（平均半径）と `closeness` に比例
- 理想距離（`a.radius + b.radius + 18`）より近すぎる場合は追加で斥力を加える
- 中心方向への微弱な引力（`0.000015`）で画面外への逸脱を防ぐ
- 速度に `0.988` の減衰をかける（摩擦）

### 高DPI対応

`resizeCanvas` で `devicePixelRatio` を取得し、`canvas.width/height` を拡大してから `ctx.setTransform` でスケールを適用する。座標計算はすべて CSS px で行う。

---

## UIインタラクション

### 円のタップ vs ドラッグ

`pointerdown` → `pointermove` → `pointerup` で追跡。移動量が `DRAG_THRESHOLD`（6px）を超えた場合はドラッグとして扱い、そうでない場合はタップとしてアクションメニューを表示する。

### ブレンドポップアップ

ドラッグ完了時に別の円との重なりを検出したとき、画面上に「つなぐ確認」ポップアップを表示する。5秒で自動クローズ。

### つなぐモード

`isBlendMode = true` の状態で2つの円をタップすると `blendHues` を実行する。強度は `blendStrengthInput`（0〜100%）で調整可能。色相を中間値へ近づけるが、明度・彩度は変化しない。

---

## 今後の拡張方針・やらないこと

### やってよいこと

- 画面のズーム・パン（円が増えても広がれるように）
- 円の複製機能の改善
- パフォーマンス最適化（`n` が大きい場合の O(n²) 問題）

### やらないこと

- テキストエディタ・アウトライン機能（他ツールの領域）
- 円同士の「線でつなぐ」表示（動きで感じてほしいため）
- クラウド同期・共有機能
- マインドマップ的な階層構造
