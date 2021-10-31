import { fetchPageById, fetchTableData, fetchNotionUsers } from "../api/notion";
import { parsePageId, getNotionValue } from "../api/utils";
import {
  RowContentType,
  CollectionType,
  RowType,
  HandlerRequest,
} from "../api/types";
import { createResponse } from "../response";

export const getTableData = async (
  collection: CollectionType,
  collectionViewId: string,
  notionToken?: string,
  raw?: boolean
) => {
  const table = await fetchTableData(
    collection.value.id,
    collectionViewId,
    notionToken
  );

  const collectionRows = collection.value.schema;
  const collectionColKeys = Object.keys(collectionRows);

  const tableArr: RowType[] = table.result.reducerResults.collection_group_results.blockIds.map(
    (id: string) => table.recordMap.block[id]
  );

  const tableData = tableArr.filter(
    (b) =>
      b.value && b.value.properties && b.value.parent_id === collection.value.id
  );

  type Row = { id: string;[key: string]: RowContentType };

  const rows: Row[] = [];

  for (const td of tableData) {
    let row: Row = { id: td.value.id };

    for (const key of collectionColKeys) {
      const val = td.value.properties[key];
      if (val) {
        const schema = collectionRows[key];
        row[schema.name] = raw ? val : getNotionValue(val, schema.type, td);
        if (schema.type === "person" && row[schema.name]) {
          const users = await fetchNotionUsers(row[schema.name] as string[]);
          row[schema.name] = users as any;
        }
      }
    }
    rows.push(row);
  }

  return { rows, schema: collectionRows };
};

export async function subcollectionPageRoute(req: HandlerRequest) {
  const pageId = parsePageId(req.params.pageId);
  const page = await fetchPageById(pageId!, req.notionToken);

  if (!page.recordMap.collection)
    return createResponse(
      JSON.stringify({ error: "No table found on Notion page: " + pageId }),
      {},
      401
    );


  // console.log('PAGE', JSON.stringify(page.recordMap.block[Object.keys(page.recordMap.block)[0]].value.format.page_icon))
  const title = page.recordMap.block[Object.keys(page.recordMap.block)[0]].value.properties.title[0][0] ? page.recordMap.block[Object.keys(page.recordMap.block)[0]].value.properties.title[0][0] : null
  const emojiOrIcon = page.recordMap.block[Object.keys(page.recordMap.block)[0]].value.format.page_icon ? page.recordMap.block[Object.keys(page.recordMap.block)[0]].value.format.page_icon : null
  const signedEmojiOrIcon = emojiOrIcon ? (emojiOrIcon.includes('http') ? signFileUrl(emojiOrIcon, pageId) : emojiOrIcon) : ''
  console.log('signedEmojiOrIcon:', signedEmojiOrIcon)
  const collections = Object.keys(page.recordMap.collection).map(
    (k) => page.recordMap.collection[k]
  );
  // let tables = []
  let tables = new Map()
  for await (const [i, item] of collections.entries()) {
    const collection = Object.keys(page.recordMap.collection).map(
      (k) => page.recordMap.collection[k]
    )[i];
    //console.log('COLLECTION', JSON.stringify(collection.value.name[0][0]))
    // console.log('COLLECTION', JSON.stringify(collection))
    const collectionView: {
      value: { id: CollectionType["value"]["id"] };
    } = Object.keys(page.recordMap.collection_view).map(
      (k) => page.recordMap.collection_view[k]
    )[i];

    const { rows, schema } = await getTableData(
      collection,
      collectionView.value.id,
      req.notionToken
    );
    // console.log('SCHEMA', JSON.stringify(schema))

    const collectionName = collection.value.name[0][0]
    const tableObject = { [collectionName]: rows }
    console.log('collectionName', collectionName)
    // leaving out root collection table as it's not part of the sub collection
    if (collectionName !== 'Collections') {
      tables.set(collectionName, rows)
    }
  }
  const responseObject = {
    title: title,
    icon: signedEmojiOrIcon,
    tables: Object.fromEntries(tables)
  }
  return createResponse(responseObject);
}


function signFileUrl(url: any, blockId: any) {
  const baseUrl = 'https://www.notion.so'
  const notionUrl = `/image/${encodeURIComponent(url)}`
  const query = `?table=block&id=${blockId}&cache=v2`
  return baseUrl + notionUrl + query
}