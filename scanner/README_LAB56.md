# 实验五/六说明

本目录同时包含两类实现：

1. **终端必做版**：位于 `scanner/scripts`，和网页代码完全分离，不引用 `scanner/src` 中的 Vue 或可视化模块。
2. **网页可视化选做版**：位于 `scanner/src`，通过侧边栏分别进入实验五和实验六页面。

---

## 一、实验五终端必做版

入口文件：

```text
scanner/scripts/lab5-cli.mjs
```

输入：一个 `.txt`、`.src` 或普通源程序文件。

输出到终端：

- 抽象语法树 AST
- 符号表
- 语义错误报告

运行：

```bash
cd scanner
npm run lab5 -- --input ../example/1.src
```

等价命令：

```bash
node scripts/lab5-cli.mjs --input ../example/1.src
```

把结果写入 txt 文件：

```bash
node scripts/lab5-cli.mjs --input ../example/1.src --out lab5-result.txt
```

---

## 二、实验六终端必做版

入口文件：

```text
scanner/scripts/lab6-cli.mjs
```

实验六提供两种运行模式。

### 模式 1：批量遍历示例代码库

自动遍历目录下所有 `.src`、`.txt`、`.cmm`、`.c`、`.cpp` 文件，依次分析，并为每个源程序生成一个结果文件。

```bash
cd scanner
npm run lab6 -- --batch ../example --out-dir ../lab6-output
```

等价命令：

```bash
node scripts/lab6-cli.mjs --batch ../example --out-dir ../lab6-output
```

输出目录中会包含：

```text
1.lab6.txt
2.lab6.txt
...
summary.txt
```

其中 `summary.txt` 是所有示例程序的汇总。

### 模式 2：单文件终端输出

```bash
cd scanner
npm run lab6 -- --input ../example/19.src
```

等价命令：

```bash
node scripts/lab6-cli.mjs --input ../example/19.src
```

把单文件结果写入 txt：

```bash
node scripts/lab6-cli.mjs --input ../example/19.src --out lab6-result.txt
```

实验六输出内容：

- 四元式中间代码
- 符号表
- 错误报告

---

## 三、网页可视化选做版

运行网页：

```bash
cd scanner
npm install
npm run dev
```

侧边栏会有两个独立入口：

```text
实验五：语义分析
实验六：中间代码
```

实验五页面展示：

- AST 树形表
- AST 文本树
- 符号表
- 作用域记录
- 错误报告
- Token 流
- 分析过程

实验六页面展示：

- AST
- 符号表
- 错误报告
- 四元式中间代码
- Token 流
- 分析过程

---

## 四、当前支持的语法/语义能力

- 函数声明：`int main() { ... };`
- 变量声明：`int x;`、`float y;`
- 一维数组声明和访问：`int arr[8];`、`arr[0]`
- 赋值语句：`x = 5`、`x += 1`
- 算术表达式：`+ - * /`
- 关系表达式：`< <= > >= == !=`
- 简单布尔表达式：`&& ||`
- `if/else`
- `while`
- `return`
- `print`
- 函数调用：`add(3, 4,)`

## 五、已实现的语义检查

- 重复声明
- 未声明变量
- 未声明函数
- 函数实参数量不匹配
- 函数实参类型不匹配
- 赋值类型不匹配，例如 `float` 赋给 `int`
- 返回值类型和函数定义类型不一致
- 非数组对象使用下标访问
