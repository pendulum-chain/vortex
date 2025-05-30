/**
 * Remove empty keys from an object
 * @param map The object to remove empty keys from
 * @returns The object without empty keys
 */
export function removeEmptyKeys(map: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(map).reduce((acc, [key, value]) => {
    if (value !== null && value !== '') {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, unknown>);
}

/**
 * Sort an object recursively
 * @param obj The object to sort
 * @returns The sorted object
 */
export function sortObject(obj: unknown): Record<string, unknown> | unknown[] | unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    const intList: number[] = [];
    const floatList: number[] = [];
    const stringList: string[] = [];
    const jsonArray: object[] = [];

    obj.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
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
    });

    intList.sort((a, b) => a - b);
    floatList.sort((a, b) => a - b);
    stringList.sort();

    const newList = [...intList, ...floatList, ...stringList, ...jsonArray];
    return newList.map((item) => (typeof item === 'object' ? sortObject(item) : item));
  }

  const sortedMap = new Map(
    Object.entries(removeEmptyKeys(obj as Record<string, unknown>)).sort(([aKey], [bKey]) => aKey.localeCompare(bKey)),
  );

  return Object.fromEntries(
    Array.from(sortedMap.entries()).map(([key, value]) => [key, typeof value === 'object' ? sortObject(value) : value]),
  );
}

/**
 * Get the path part of a URL with sorted query parameters
 * @param requestUrl The URL
 * @returns The path with sorted query parameters
 */
export function getPath(requestUrl: string): string {
  const uri = new URL(requestUrl);
  const path = uri.pathname;
  const params = Array.from(uri.searchParams.entries());

  if (params.length === 0) {
    return path;
  }
  const sortedParams = [...params].sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
  const queryString = sortedParams.map(([key, value]) => `${key}=${value}`).join('&');
  return `${path}?${queryString}`;
}

/**
 * Get the JSON body for a request, sorted for API signing
 * @param body The body string
 * @returns The sorted JSON body
 */
export function getJsonBody(body: string): string {
  let map: Record<string, unknown>;

  try {
    map = JSON.parse(body);
  } catch (error) {
    map = {};
    console.error("Couldn't parse JSON body", error);
  }

  if (Object.keys(map).length === 0) {
    return '';
  }

  map = removeEmptyKeys(map);
  map = sortObject(map) as Record<string, unknown>;

  return JSON.stringify(map);
}
