export const SHARED_SOURCE_EVENT = 'compiler-lab-shared-source-change'
export const SHARED_SOURCE_KEY = 'compiler_lab_shared_source'
export const SHARED_SOURCE_NAME_KEY = 'compiler_lab_shared_source_name'

export const SOURCE_SAMPLES = [
  {
    id: 'float-main',
    name: '样例1：float 返回值',
    filename: 'float-main.src',
    source: `float main() {
    float x;
    x = 3.14;
    return x
};
main()`,
  },
  {
    id: 'print-string',
    name: '样例2：字符串输出 print("Yes")',
    filename: 'print-string.src',
    source: `int main() {
    if (1 < 2) {
        print("Yes");
    }
};
main()`,
  },
  {
    id: 'char-var',
    name: '样例3：字符变量 char',
    filename: 'char-var.src',
    source: `int main() {
    char c;
    c = 'A';
    print(c);
    return 0
};
main()`,
  },
  {
    id: 'semantic-error',
    name: '样例4：语义错误-未声明变量',
    filename: 'semantic-error.src',
    source: `void test() {
    print a
};
test()`,
  },
  {
    id: 'function-call',
    name: '样例5：函数调用 add',
    filename: 'function-call.src',
    source: `int add(int a; int b;) {
    return a + b
};

int main() {
    int x;
    x = add(3, 4,);
    print(x);
    return x
};
main()`,
  },
]

function safeLocalStorageGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeLocalStorageSet(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

export function getSharedSource() {
  return safeLocalStorageGet(SHARED_SOURCE_KEY) || SOURCE_SAMPLES[0].source
}

export function getSharedSourceName() {
  return safeLocalStorageGet(SHARED_SOURCE_NAME_KEY) || SOURCE_SAMPLES[0].filename
}

export function setSharedSource(source, name = 'manual.src') {
  safeLocalStorageSet(SHARED_SOURCE_KEY, source)
  safeLocalStorageSet(SHARED_SOURCE_NAME_KEY, name)
  window.dispatchEvent(new CustomEvent(SHARED_SOURCE_EVENT, { detail: { source, name } }))
}

export function onSharedSourceChange(handler) {
  const listener = (event) => handler(event.detail || { source: getSharedSource(), name: getSharedSourceName() })
  window.addEventListener(SHARED_SOURCE_EVENT, listener)
  return () => window.removeEventListener(SHARED_SOURCE_EVENT, listener)
}

export function installScannerSampleBridge() {
  queueMicrotask(() => {
    if (document.querySelector('[data-shared-sample-bridge]')) return
    const toolbar = document.querySelector('main .toolbar')
    const sourceBox = document.querySelector('textarea.source')
    if (!toolbar || !sourceBox) return

    const select = document.createElement('select')
    select.dataset.sharedSampleBridge = 'true'
    select.title = '选择样本库样例，后续实验页面会自动同步'
    select.innerHTML = SOURCE_SAMPLES.map((sample) => `<option value="${sample.id}">${sample.name}</option>`).join('')

    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = '载入共享样本'
    button.title = '载入到实验一/二页面，并同步给实验三到八页面'

    const syncToScanner = (sample) => {
      sourceBox.value = sample.source
      sourceBox.dispatchEvent(new Event('input', { bubbles: true }))
      const tab = document.querySelector('.tab')
      if (tab) tab.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.textContent = sample.filename
      })
      setSharedSource(sample.source, sample.filename)
      const runButton = toolbar.querySelector('button.primary')
      setTimeout(() => runButton?.click(), 0)
    }

    button.addEventListener('click', () => {
      const sample = SOURCE_SAMPLES.find((item) => item.id === select.value) || SOURCE_SAMPLES[0]
      syncToScanner(sample)
    })

    sourceBox.addEventListener('input', () => {
      setSharedSource(sourceBox.value, 'scanner-current.src')
    })

    toolbar.insertBefore(select, toolbar.children[2] || null)
    toolbar.insertBefore(button, toolbar.children[3] || null)

    const initial = getSharedSource()
    if (initial && sourceBox.value !== initial) {
      sourceBox.value = initial
      sourceBox.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
}
