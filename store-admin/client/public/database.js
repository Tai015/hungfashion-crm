const tableList = document.querySelector('#table-list');
const tableCount = document.querySelector('#table-count');
const selectedTableLabel = document.querySelector('#selected-table');
const rowCount = document.querySelector('#row-count');
const notice = document.querySelector('#notice');
const tableHead = document.querySelector('#table-head');
const tableBody = document.querySelector('#table-body');
const pageLabel = document.querySelector('#page-label');
const previousPageButton = document.querySelector('#previous-page');
const nextPageButton = document.querySelector('#next-page');

const pageSize = 50;
let tables = [];
let selectedTable = '';
let offset = 0;
let totalRows = 0;

async function requestJson(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
  return body;
}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = !message;
}

function renderTables() {
  tableList.replaceChildren();
  tableCount.textContent = `${tables.length} bảng trong schema public`;

  for (const table of tables) {
    const button = document.createElement('button');
    button.className = `table-item${table.name === selectedTable ? ' active' : ''}`;
    button.type = 'button';

    const name = document.createElement('span');
    name.textContent = table.name;
    const count = document.createElement('small');
    count.textContent = `${table.columnCount} cột`;
    button.append(name, count);
    button.addEventListener('click', () => loadTable(table.name, 0));
    tableList.append(button);
  }
}

function formatCell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderRows(data) {
  selectedTableLabel.textContent = data.table;
  rowCount.textContent = `${data.total.toLocaleString('vi-VN')} dòng`;

  const headerRow = document.createElement('tr');
  for (const column of data.columns) {
    const header = document.createElement('th');
    header.textContent = column.name;
    const type = document.createElement('small');
    type.textContent = column.type;
    header.append(type);
    headerRow.append(header);
  }
  tableHead.replaceChildren(headerRow);
  tableBody.replaceChildren();

  if (data.rows.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'empty-cell';
    cell.colSpan = Math.max(data.columns.length, 1);
    cell.textContent = 'Bảng chưa có dữ liệu.';
    row.append(cell);
    tableBody.append(row);
  } else {
    for (const record of data.rows) {
      const row = document.createElement('tr');
      for (const column of data.columns) {
        const cell = document.createElement('td');
        const value = record[column.name];
        cell.textContent = formatCell(value);
        if (value === null || value === undefined) cell.className = 'null';
        row.append(cell);
      }
      tableBody.append(row);
    }
  }

  const firstRow = data.total === 0 ? 0 : data.offset + 1;
  const lastRow = Math.min(data.offset + data.rows.length, data.total);
  pageLabel.textContent = data.total === 0 ? 'Chưa có dữ liệu' : `Dòng ${firstRow}-${lastRow} / ${data.total}`;
  previousPageButton.disabled = data.offset === 0;
  nextPageButton.disabled = data.offset + data.rows.length >= data.total;
}

async function loadTable(name, nextOffset) {
  selectedTable = name;
  offset = nextOffset;
  renderTables();
  showNotice('Đang tải dữ liệu...');
  try {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    const data = await requestJson(`/api/database/tables/${encodeURIComponent(name)}/rows?${params}`);
    totalRows = data.total;
    renderRows(data);
    showNotice('');
  } catch (error) {
    showNotice(error.message);
    tableHead.replaceChildren();
    tableBody.replaceChildren();
    rowCount.textContent = '';
  }
}

async function loadTables() {
  showNotice('Đang kết nối PostgreSQL...');
  try {
    const data = await requestJson('/api/database/tables');
    tables = data.tables;
    renderTables();
    showNotice('');
    if (tables.length === 0) {
      selectedTableLabel.textContent = 'Chưa có bảng';
      pageLabel.textContent = 'Không có bảng trong schema public';
      return;
    }
    await loadTable(selectedTable && tables.some((item) => item.name === selectedTable) ? selectedTable : tables[0].name, 0);
  } catch (error) {
    tables = [];
    renderTables();
    showNotice(`Không tải được danh sách bảng: ${error.message}`);
  }
}

document.querySelector('#refresh-tables').addEventListener('click', loadTables);
previousPageButton.addEventListener('click', () => loadTable(selectedTable, Math.max(0, offset - pageSize)));
nextPageButton.addEventListener('click', () => loadTable(selectedTable, offset + pageSize));

loadTables();