/*
  This CCA requires a single-line text property to exist on products called "dependent_skus". Child products would have a csv of parent SKUs in this property.
  When a product with a SKU is added to a deal, any products with a matching dependent_skus value could be added as well. Similar logic could be applied to other
  custom properties if SKU matching is not desired.
*/
const hubspot = require('@hubspot/api-client');
const hubspotClient = new hubspot.Client({ accessToken: process.env.TOKEN })
exports.main = async (event, callback) => {

  //Get Line Items IDs for Deal
  const dealWithLineItems = await hubspotClient.crm.deals.basicApi.getById(
    event.object.objectId,
    undefined,
    undefined,
    ["line_items"]
  )
  
  //Get Line Items
  const lineItems = await hubspotClient.crm.lineItems.batchApi.read({
    inputs: dealWithLineItems.associations["line items"].results,
    properties: [
      "hs_sku",
      "dependent_skus",
      "hs_product_id"
    ]
  });
  
  //Delete all dependent line items
  const lineItemsToDelete = lineItems.results.filter(line_item => line_item.properties.dependent_skus != null);
  if(lineItemsToDelete.length > 0){
  	await hubspotClient.crm.lineItems.batchApi.archive({
    	inputs: lineItemsToDelete
  	});
  }

  const baseLineItems = lineItems.results.filter(line_item => line_item.properties.dependent_skus == null).map(line_item => {
    return {
        filters: [{
          propertyName: "dependent_skus",
          operator: "CONTAINS_TOKEN",
          value: line_item.properties.hs_sku
        }]
      }
  })
  
  //Get Products dependent products based on skus
  const products = await hubspotClient.crm.products.searchApi.doSearch({filterGroups: baseLineItems,limit:100});

  //Add Line Items to Deal
  await hubspotClient.apiRequest({
    method: "POST",
    path: "/crm/v3/objects/line_items/batch/create",
    body: {inputs: products.results.map(product => { 
      return {
        properties: {
          hs_product_id: product.id,
          quantity: 1,
          hs_position_on_quote: 100
        },
        associations: [
          {
            to: {
              id: event.object.objectId
            },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 20
              }
          ]
          }
        ]
      }
    })}
  });
  
  //Return base product line items
  callback({
    outputFields: {}
  });
}
