# 实验五/六必做部分说明

本次提交在 `scanner/scripts/lab56-cli.mjs` 中完成实验五和实验六的终端必做版。

## 实验五：SLR 引导的语义分析框架

输入：源程序或示例代码库中的 `.src` 文件。

输出：

- AST 文本树
- 符号表
- 语义/语法/词法错误报告
- 可选 Token 流
- 可选分析步骤

运行：

```bash
cd scanner
npm run lab5 -- --source ../example/1.src
```

等价命令：

```bash
node scripts/lab56-cli.mjs --stage 5 --source ../example/1.src
```

显示 Token 流和分析步骤：

```bash
node scripts/lab56-cli.mjs --stage 5 --source ../example/1.src --show-tokens --show-steps
```

## 实验六：中间代码生成

实验六复用实验五生成的 AST 和符号表，输出四元式形式的中间代码。

运行：

```bash
cd scanner
npm run lab6 -- --source ../example/18.src
```

等价命令：

```bash
node scripts/lab56-cli.mjs --stage 6 --source ../example/18.src
```

导出 JSON，供后续实验七/八或网页可视化读取：

```bash
node scripts/lab56-cli.mjs --stage 6 --source ../example/18.src --json --out lab56-output.json
```

## 当前支持的语法/语义能力

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

## 已实现的语义检查

- 重复声明
- 未声明变量
- 未声明函数
- 函数实参数量不匹配
- 函数实参类型不匹配
- 赋值类型不匹配，例如 `float` 赋给 `int`
- 返回值类型和函数定义类型不一致
- 非数组对象使用下标访问

## 示例

```bash
node scripts/lab56-cli.mjs --stage 6 --source ../example/19.src
node scripts/lab56-cli.mjs --stage 6 --source ../example/17.src
```

其中 `example/17.src` 会报告未声明变量 `c`，`example/19.src` 会生成带条件跳转的四元式。