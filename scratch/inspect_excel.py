import zipfile
import xml.etree.ElementTree as ET

def dump_data_rows(file_path):
    with zipfile.ZipFile(file_path, 'r') as z:
        namelist = z.namelist()
        shared_strings = []
        if 'xl/sharedStrings.xml' in namelist:
            with z.open('xl/sharedStrings.xml') as f:
                tree = ET.parse(f)
                root = tree.getroot()
                ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                for t in root.findall('.//ns:t', ns):
                    shared_strings.append(t.text)
        
        sheet_file = 'xl/worksheets/sheet1.xml'
        with z.open(sheet_file) as f:
            tree = ET.parse(f)
            root = tree.getroot()
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            
            rows = root.findall('.//ns:row', ns)
            print(f"Total rows in XML: {len(rows)}")
            
            for r in rows:
                row_idx = int(r.attrib.get('r'))
                row_vals = []
                has_data = False
                for c in r.findall('ns:c', ns):
                    v = c.find('ns:v', ns)
                    val = ""
                    if v is not None:
                        val = v.text
                        t = c.attrib.get('t')
                        if t == 's' and shared_strings:
                            idx = int(val)
                            val = shared_strings[idx] if idx < len(shared_strings) else f"str_{idx}"
                        
                        if val.strip():
                            has_data = True
                    row_vals.append((c.attrib.get('r'), val))
                
                # If the row has some data and it's after row 10, print it
                if has_data and row_idx >= 11:
                    # Filter out trailing empty cells to make it readable
                    non_empty_vals = [(col, val) for col, val in row_vals if val.strip()]
                    print(f"Row {row_idx}: {non_empty_vals}")

if __name__ == '__main__':
    path = r"C:\Users\pc\Desktop\Plantilla de despiece TU MUEBLE EN MELAMINA (2).xlsm"
    dump_data_rows(path)
