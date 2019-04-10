const FormulaError = require('../formulas/error');
const {FormulaHelpers, Address} = require('../formulas/helpers');
const lexer = require('../grammar/lexing');
const Utils = require('../grammar/utils');
const FormulaParser = require('../index');
const XlsxPopulate = require('xlsx-populate');
const MAX_ROW = 1048576, MAX_COLUMN = 16384;

let t = Date.now();
let parser, wb;

function getSharedFormula(cell, refCell) {

    const refFormula = refCell.getSharedRefFormula();

    const refCol = refCell.columnNumber();
    const refRow = refCell.rowNumber();
    const cellCol = cell.columnNumber();
    const cellRow = cell.rowNumber();

    const offsetCol = cellCol - refCol;
    const offsetRow = cellRow - refRow;

    const formula = refFormula
        .replace(/(\$)?([A-Z]+)(\$)?([0-9]+)(\()?/g, (match, absCol, colName, absRow, row, isFunction, index) => {
            if (!!isFunction) {
                return match;
            }

            const col = +Address.columnNameToNumber(colName);
            row = +row;

            const _col = !!absCol ? col : col + offsetCol;
            const _row = !!absRow ? row : row + offsetRow;

            const _colName = Address.columnNumberToName(_col);
            return `${_colName}${_row}`;
        });

    return formula;
}

function initParser() {
    parser = new FormulaParser({
        onCell: ref => {
            const val = wb.sheet(ref.sheet).row(ref.row).cell(ref.col).value();
            // console.log(`Get cell ${val}`);
            return val == null ? null : val;
        },
        onRange: ref => {
            const arr = [];
            const sheet = wb.sheet(ref.sheet);
            // whole column
            if (ref.to.row === MAX_ROW) {
                sheet._rows.forEach((row, rowNumber) => {
                    const cellValue = row.cell(ref.from.row)._value;
                    arr[rowNumber] = [cellValue == null ? null : cellValue];
                })
            }
            // whole row
            else if (ref.to.col === MAX_COLUMN) {
                arr.push([]);
                sheet._rows[ref.from.row].forEach(cell => {
                    arr[0].push(cell._value == null ? null : cell._value)
                })

            } else {
                for (let row = ref.from.row - 1; row < ref.to.row; row++) {
                    const innerArr = [];
                    for (let col = ref.from.col - 1; col < ref.to.col; col++) {
                        const cellValue = wb.sheet(ref.sheet).row(ref.row + 1).cell(ref.col + 1)._value;
                        innerArr.push(cellValue == null ? null : cellValue)
                    }
                    arr.push(innerArr);
                }
            }
            // console.log(`Get cell ${arr}`);
            return arr;
        }
    });
}

function something(workbook) {
    wb = workbook;
    initParser();
    console.log(`open workbook uses ${Date.now() - t}ms`);
    t = Date.now();
    const formulas = [];
    workbook.sheets().forEach(sheet => {
        const name = sheet.name();
        const sharedFormulas = [];
        sheet._rows.forEach((row, rowNumber) => {
            // const rowStyle = styles[rowNumber - 1] = {};
            row._cells.forEach((cell, colNumber) => {
                // process cell data
                let formula = cell.formula();
                if (typeof formula === 'string') {
                    // this is the parent shared formula
                    if (formula !== 'SHARED' && cell._sharedFormulaId !== undefined) {
                        sharedFormulas[cell._sharedFormulaId] = cell;
                    } else if (formula === 'SHARED') {
                        // convert this cell to normal formula
                        const refCell = sharedFormulas[cell._sharedFormulaId];
                        formula = getSharedFormula(cell, refCell);
                        const oldValue = cell.value();
                        cell.formula(formula)._value = oldValue;
                    }
                    formulas.push(formula);
                    console.log(formula, `sheet: ${name}, row: ${rowNumber}, col: ${colNumber}`);
                    const res = parser.parse(formula, {sheet: name, row: rowNumber, col: colNumber});
                    if (res != null && res.result)
                        cell._value = res.result;
                    else
                        cell._value = res;

                }
            });
        });
    });
    console.log(`process formulas uses ${Date.now() - t}ms, with ${formulas.length} formulas.`);

}


XlsxPopulate.fromFileAsync("./xlsx/test.xlsx").then(something);
// 2019/4/9 20:00
// open workbook uses 1235ms
// process formulas uses 315450ms, with 26283 formulas.