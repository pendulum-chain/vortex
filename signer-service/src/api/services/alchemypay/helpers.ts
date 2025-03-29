export function removeEmptyKeys(map: Record<string, unknown>): Record<string, unknown> {
  const retMap: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(map)) {
    if (value !== null && value !== '') {
      retMap[key] = value;
    }
  }

  return retMap;
}

function sortMap(map: Record<string, unknown>): Record<string, unknown> {
  const sortedMap = new Map(Object.entries(removeEmptyKeys(map)).sort(([aKey], [bKey]) => aKey.localeCompare(bKey)));

  for (const [key, value] of sortedMap.entries()) {
    if (typeof value === 'object') {
      sortedMap.set(key, sortObject(value));
    }
  }

  return Object.fromEntries(sortedMap.entries());
}

function sortList(list: unknown[]): unknown[] {
  const objectList: unknown[] = [];
  const intList: number[] = [];
  const floatList: number[] = [];
  const stringList: string[] = [];
  const jsonArray: object[] = [];

  for (const item of list) {
    if (typeof item === 'object') {
      jsonArray.push(item as object);
    } else if (Number.isInteger(item)) {
      intList.push(item as number);
    } else if (typeof item === 'number') {
      floatList.push(item);
    } else if (typeof item === 'string') {
      stringList.push(item);
    } else {
      intList.push(Number(item));
    }
  }

  intList.sort((a, b) => a - b);
  floatList.sort((a, b) => a - b);
  stringList.sort();

  objectList.push(...intList, ...floatList, ...stringList, ...jsonArray);
  list.length = 0;
  list.push(...objectList);

  const retList: unknown[] = [];

  for (const item of list) {
    if (typeof item === 'object') {
      retList.push(sortObject(item));
    } else {
      retList.push(item);
    }
  }

  return retList;
}

export function sortObject(obj: unknown): Record<string, unknown> | unknown[] | unknown {
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return sortList(obj);
    } 
      return sortMap(obj as Record<string, unknown>);
    
  }

  return obj;
}
