import unittest
from unittest.mock import AsyncMock, patch

from scrapers.models import ProductData
from scrapers import search_web


class TestCurlFirstSearch(unittest.IsolatedAsyncioTestCase):
    async def test_uses_http_first_and_skips_full_scrape_when_good(self):
        good = ProductData(
            title="Onitsuka Tiger Mexico 66",
            price_jpy=12000,
            price_display="JPY 12,000",
            images=["https://example.com/a.jpg"],
            marketplace="mercari",
            url="https://jp.mercari.com/item/m123",
        )

        with patch.object(search_web, "scrape_generic_http", AsyncMock(return_value=good)) as light_mock, patch.object(
            search_web, "scrape_url", AsyncMock(side_effect=AssertionError("full scrape should not be called"))
        ) as full_mock:
            result = await search_web._scrape_candidate_curl_first(
                url="https://jp.mercari.com/item/m123",
                tokens=["onitsuka", "tiger"],
            )

        self.assertIsNotNone(result)
        self.assertEqual(result.title, "Onitsuka Tiger Mexico 66")
        light_mock.assert_awaited_once()
        full_mock.assert_not_awaited()

    async def test_falls_back_to_full_scrape_when_http_result_unusable(self):
        bad = ProductData(
            title="Unknown Product",
            price_jpy=None,
            price_display="",
            images=[],
            marketplace="mercari",
            url="https://jp.mercari.com/item/m123",
            scrape_reason_code="PARSE_EMPTY",
        )
        good = ProductData(
            title="Onitsuka Tiger Mexico 66",
            price_jpy=10000,
            price_display="JPY 10,000",
            images=["https://example.com/a.jpg"],
            marketplace="mercari",
            url="https://jp.mercari.com/item/m123",
        )

        with patch.object(search_web, "scrape_generic_http", AsyncMock(return_value=bad)) as light_mock, patch.object(
            search_web, "scrape_url", AsyncMock(return_value=good)
        ) as full_mock:
            result = await search_web._scrape_candidate_curl_first(
                url="https://jp.mercari.com/item/m123",
                tokens=["onitsuka", "tiger"],
            )

        self.assertIsNotNone(result)
        self.assertEqual(result.price_jpy, 10000)
        light_mock.assert_awaited_once()
        full_mock.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
