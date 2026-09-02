"""Verifica o modelo XLSX com biblioteca padrão, sem editar a planilha."""
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(ROOT / 'templates/modelo-itens-emenda.xlsx') as archive:
    assert archive.testzip() is None
    sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    rules = sheet.findall('x:dataValidations/x:dataValidation', NS)
    assert len(rules) == 2
    expected = {
        'C2:C1001': 'INDIRECT("\'Listas\'!$B$2:$B$21")',
        'D2:D1001': 'INDIRECT("\'Listas\'!$A$2:$A$54")',
    }
    for rule in rules:
        assert rule.get('type') == 'list'
        assert rule.get('errorStyle') == 'stop'
        assert rule.get('showErrorMessage') == '1'
        assert rule.get('showDropDown', '0') != '1'  # OOXML: 1 oculta a seta.
        assert rule.find('x:formula1', NS).text == expected[rule.get('sqref')]
    lists = ET.fromstring(archive.read('xl/worksheets/sheet3.xml'))
    cells = {c.get('r'): c for c in lists.findall('.//x:sheetData/x:row/x:c', NS)}
    assert all(f'A{i}' in cells for i in range(2, 55))
    assert all(f'B{i}' in cells for i in range(2, 22))
    strings = ET.fromstring(archive.read('xl/sharedStrings.xml'))
    texts = [''.join(t.text or '' for t in si.findall('.//x:t', NS)) for si in strings]
    texts += [c.find('x:v', NS).text for c in cells.values() if c.get('t') == 'str']
    assert 'UBS Aparecidinha' in texts
    assert 'SES – AGUARDANDO RESERVA' in texts
print('PASSOU: listas de unidade/status, 1000 linhas, fontes e validação de parada no XLSX.')
